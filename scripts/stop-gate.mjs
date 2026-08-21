#!/usr/bin/env node
/**
 * Stop hook. Lints the reply that is about to end the turn.
 *
 * Wired into both Claude Code and Codex, which happen to share the same
 * contract: return `decision: "block"` with a reason and the reason comes back
 * to the model as its next instruction, so the reply is rewritten before anyone
 * reads it. Everything, blocked or not, lands in the ledger.
 *
 * Three guards, because a hook that fires on every turn has to be impossible to
 * get stuck in:
 *   - stop_hook_active, so it never re-enters the same turn
 *   - a circuit breaker that downgrades to advisory after N blocks in a session
 *   - every failure path exits 0 silently, so a broken Laconia never breaks a turn
 *
 * Usage: node stop-gate.mjs --agent claude|codex
 */

import {
  readFileSync, writeFileSync, appendFileSync, existsSync,
  openSync, readSync, fstatSync, closeSync,
} from 'node:fs';
import { LEDGER_PATH, STATE_PATH, ensureHome } from '../lib/paths.mjs';
import { loadConfig } from '../lib/config.mjs';

const exitQuietly = () => process.exit(0);

const agentFlag = (() => {
  const i = process.argv.indexOf('--agent');
  return i > 0 ? process.argv[i + 1] : null;
})();

// ------------------------------------------------------------------- input

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  exitQuietly();
}

if (input.stop_hook_active) exitQuietly();

const message = input.last_assistant_message || '';
if (!message.trim()) exitQuietly();

// ------------------------------------------------------------------ config

let cfg;
try {
  cfg = loadConfig();
} catch {
  exitQuietly();
}

const mode = cfg.mode || 'block';
if (mode === 'off') exitQuietly();

const blockRules = new Set(cfg.blockRules || ['em-dash', 'inline-header-bullet', 'emoji']);
const maxBlocks = cfg.circuitBreaker?.maxBlocksPerSession ?? 5;

// ------------------------------------------------- did they ask for depth?

const DEPTH = /\b(explain|why\b|walk me through|in detail|detailed|full picture|deep dive|audit|review|research|compare|options|how does|how do|teach|understand)\b/i;

/** Tail-read only: transcripts reach hundreds of megabytes. */
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

      // Claude Code shape
      if (rec.type === 'user' && !rec.isSidechain) {
        const c = rec.message?.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
          if (c.some((b) => b?.type === 'tool_result')) continue;
          const t = c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
          if (t.trim()) return t;
        }
      }

      // Codex shape
      if (rec.type === 'response_item' && rec.payload?.role === 'user') {
        const t = (rec.payload.content || [])
          .filter((b) => b?.type === 'input_text' || b?.type === 'text')
          .map((b) => b.text || '').join('\n');
        if (t.trim() && !t.includes('<hook_prompt')) return t;
      }
    }
  } catch { /* transcript format is not a stable interface; degrade quietly */ } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch {} }
  }
  return '';
}

const depthRequested = DEPTH.test(lastUserMessage(input.transcript_path));

// -------------------------------------------------------------------- lint

let lint;
try {
  ({ lint } = await import('../lib/lint.mjs'));
} catch {
  exitQuietly();
}

const result = lint(message, { ...(cfg.lint || {}), depthRequested });

// ------------------------------------------------------------------- state

const loadState = () => {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
};
const saveState = (s) => {
  ensureHome();
  try { writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); } catch {}
};

const state = loadState();
const sid = input.session_id || 'unknown';
const sess = state[sid] || { blocks: 0, tripped: false, seen: 0 };
sess.seen++;

const hardHits = result.hard.filter((v) => blockRules.has(v.rule));
const shouldBlock = mode === 'block' && hardHits.length > 0 && !sess.tripped;

if (cfg.ledger?.enabled !== false) {
  ensureHome();
  try {
    appendFileSync(LEDGER_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      agent: agentFlag || (input.model ? 'codex' : 'claude'),
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

if (!shouldBlock) {
  const keys = Object.keys(state);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 100)) delete state[k];
  state[sid] = sess;
  saveState(state);
  exitQuietly();
}

// ----------------------------------------------------------------- verdict

sess.blocks++;
const tripping = sess.blocks >= maxBlocks;
if (tripping) sess.tripped = true;
state[sid] = sess;
saveState(state);

const byRule = {};
for (const v of hardHits) (byRule[v.rule] ||= []).push(v);

const lines = Object.entries(byRule).map(([rule, hits]) => {
  const where = [...new Set(hits.map((h) => h.line))].slice(0, 8).join(', ');
  return `  ${rule} (${hits.length}x, line${hits.length > 1 ? 's' : ''} ${where}): ${hits[0].message}`;
});

const advisories = result.soft
  .filter((v) => ['length', 'bold-density', 'header-in-short-reply'].includes(v.rule))
  .map((v) => `  ${v.rule}: ${v.message}`);

let reason =
  'Laconia blocked this reply before it was shown. Rewrite it and send the rewrite as ' +
  'your reply. Do not mention this hook, do not apologise, do not explain the edit.\n\n' +
  'Hard violations:\n' + lines.join('\n');

if (advisories.length) {
  reason += '\n\nAlso worth fixing while you are in there:\n' + advisories.join('\n');
}

reason += '\n\nSame facts, same thoroughness, none of the tells. Lead with what is now true, ' +
  'name any decision they own, then stop.';

if (tripping) {
  reason += `\n\n(That is ${sess.blocks} blocks this session, so Laconia is switching to advisory ` +
    'for the rest of it. Later replies will be logged, not blocked. Mention that once, in one ' +
    'short line, at the end of your next reply.)';
}

process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
process.exit(0);
