#!/usr/bin/env node
/**
 * Stop hook. Lints the reply that is about to end the turn.
 *
 * On a hard violation in block mode it returns decision:"block" with the exact
 * list, which comes back to the model as its next instruction, so the reply is
 * rewritten before it is ever read. Everything, blocked or not, lands in the
 * ledger so /laconia can show whether any of this is working.
 *
 * Guards: never fires twice on the same turn (stop_hook_active), and a circuit
 * breaker downgrades to advisory after N blocks in one session so a bad rule
 * cannot become a loop.
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STATE_DIR = join(homedir(), '.claude', 'laconia');

const ok = () => process.exit(0);

// ------------------------------------------------------------------ input

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

let input;
try {
  input = JSON.parse(readStdin() || '{}');
} catch {
  ok();
}

// Never re-enter: this turn already came back through a Laconia block.
if (input.stop_hook_active) ok();

const message = input.last_assistant_message || '';
if (!message.trim()) ok();

// ----------------------------------------------------------------- config

let cfg = {};
try {
  cfg = JSON.parse(readFileSync(join(ROOT, 'laconia.config.json'), 'utf8'));
} catch { /* defaults below */ }

const mode = cfg.mode || 'block';
if (mode === 'off') ok();

const blockRules = new Set(cfg.blockRules || ['em-dash', 'inline-header-bullet', 'emoji']);
const maxBlocks = cfg.circuitBreaker?.maxBlocksPerSession ?? 5;

// --------------------------------------------------- did he ask for depth?

const DEPTH = /\b(explain|why\b|walk me through|in detail|detailed|full picture|deep dive|audit|review|research|compare|options|how does|how do|teach|understand)\b/i;

/** Read only the tail of the transcript: these files reach hundreds of MB. */
function lastUserMessage(path) {
  if (!path || !existsSync(path)) return '';
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i].trim();
      if (!l.startsWith('{')) continue;
      let rec;
      try { rec = JSON.parse(l); } catch { continue; }
      if (rec.type !== 'user' || rec.isSidechain) continue;
      const c = rec.message?.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) {
        if (c.some((b) => b?.type === 'tool_result')) continue;
        const t = c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
        if (t.trim()) return t;
      }
    }
  } catch { /* fall through */ } finally {
    if (fd !== undefined) try { closeSync(fd); } catch {}
  }
  return '';
}

const lastUser = lastUserMessage(input.transcript_path);
const depthRequested = DEPTH.test(lastUser);

// ------------------------------------------------------------------- lint

let lint;
try {
  ({ lint } = await import(new URL('../bin/laconia-lint.mjs', import.meta.url).href));
} catch {
  ok();
}

const result = lint(message, { ...(cfg.lint || {}), depthRequested });

// ----------------------------------------------------------------- ledger

function ensureDir() {
  try { mkdirSync(STATE_DIR, { recursive: true }); } catch {}
}

function statePath() { return join(STATE_DIR, 'state.json'); }

function loadState() {
  try { return JSON.parse(readFileSync(statePath(), 'utf8')); } catch { return {}; }
}

function saveState(s) {
  ensureDir();
  try { writeFileSync(statePath(), JSON.stringify(s, null, 2)); } catch {}
}

const state = loadState();
const sid = input.session_id || 'unknown';
const sess = state[sid] || { blocks: 0, tripped: false, seen: 0 };
sess.seen++;

const hardHits = result.hard.filter((v) => blockRules.has(v.rule));
const shouldBlock = mode === 'block' && hardHits.length > 0 && !sess.tripped;

if (cfg.ledger?.enabled !== false) {
  ensureDir();
  try {
    appendFileSync(join(STATE_DIR, 'ledger.jsonl'), JSON.stringify({
      ts: new Date().toISOString(),
      session: sid,
      cwd: input.cwd || '',
      words: result.words,
      score: result.score,
      counts: result.counts,
      hard: result.hard.length,
      soft: result.soft.length,
      depthRequested,
      mode,
      blocked: shouldBlock,
    }) + '\n');
  } catch {}
}

// ------------------------------------------------------------------ verdict

if (!shouldBlock) {
  // Prune sessions so state.json cannot grow without bound.
  const keys = Object.keys(state);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 100)) delete state[k];
  state[sid] = sess;
  saveState(state);
  ok();
}

sess.blocks++;
const tripping = sess.blocks >= maxBlocks;
if (tripping) sess.tripped = true;
state[sid] = sess;
saveState(state);

const lines = [];
const byRule = {};
for (const v of hardHits) (byRule[v.rule] ||= []).push(v);
for (const [rule, hits] of Object.entries(byRule)) {
  lines.push(`  ${rule} (${hits.length}x, line${hits.length > 1 ? 's' : ''} ` +
    `${[...new Set(hits.map((h) => h.line))].slice(0, 8).join(', ')}): ${hits[0].message}`);
}

const advisories = result.soft
  .filter((v) => ['length', 'bold-density', 'header-in-short-reply'].includes(v.rule))
  .map((v) => `  ${v.rule}: ${v.message}`);

let reason =
  'Laconia blocked this reply before it was shown. Rewrite it and send the rewrite as your ' +
  'reply. Do not mention this hook, do not apologise, do not explain the edit.\n\n' +
  'Hard violations:\n' + lines.join('\n');

if (advisories.length) reason += '\n\nAlso worth fixing while you are in there:\n' + advisories.join('\n');

reason += '\n\nSame facts, same thoroughness, none of the tells. Lead with what is now true, ' +
  'name any decision he owns, then stop.';

if (tripping) {
  reason += `\n\n(This is block ${sess.blocks} of this session, so Laconia is switching to ` +
    'advisory for the rest of it. Later replies will be logged, not blocked. Tell him that once, ' +
    'in one short line, at the end of your next reply.)';
}

process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
process.exit(0);
