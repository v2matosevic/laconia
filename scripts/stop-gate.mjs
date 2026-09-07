#!/usr/bin/env node
// Stop is an after-reply check. A correction can be visible beneath the original.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LACONIA_HOME, LEDGER_PATH, STATE_PATH, PKG_ROOT } from '../lib/paths.mjs';
import { loadConfig, effectiveConfigJson } from '../lib/config.mjs';
import { lint } from '../lib/lint.mjs';
import { voiceHash } from '../lib/voice.mjs';
import { lastUserMessage, requestContext, lastTranscriptModel } from '../lib/transcripts.mjs';
import { resolveAgent } from '../lib/agent.mjs';

const digest = (s) => createHash('sha256').update(s).digest('hex');
let lock;
try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  if (typeof input.last_assistant_message !== 'string' || !input.last_assistant_message.trim()) process.exit(0);
  const cfg = loadConfig();
  if (cfg.mode === 'off') process.exit(0);
  const agent = resolveAgent(input);
  const session = String(input.session_id || input.thread_id || 'unknown');
  const dir = join(LACONIA_HOME, 'sessions');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, digest(agent + ':' + session) + '.json');
  const candidateLock = path + '.lock';
  // Isolate sessions and serialize duplicate hooks for the same session. A dead
  // process cannot strand a lock forever. No shared read/modify/write state.
  if (existsSync(candidateLock) && Date.now() - statSync(candidateLock).mtimeMs > 60000) rmSync(candidateLock, { recursive: true, force: true });
  try { mkdirSync(candidateLock); } catch { process.exit(0); }
  lock = candidateLock;
  let state = { blocks: 0, tripped: false };
  try { state = JSON.parse(readFileSync(path, 'utf8')); }
  catch { try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))[session] || state; } catch {} }
  const context = requestContext(lastUserMessage(input.transcript_path));
  const result = lint(input.last_assistant_message, { ...cfg.lint, depthRequested: context.depthRequested });
  const correction = input.stop_hook_active === true;
  const key = input.turn_id ? digest(String(input.turn_id) + ':' + correction + ':' + input.last_assistant_message) : null;
  if (key && state.lastKey === key) process.exitCode = 0;
  else {
    const hits = result.hard.filter((v) => cfg.blockRules.includes(v.rule));
    const max = cfg.circuitBreaker.maxBlocksPerSession;
    const blocked = cfg.mode === 'block' && hits.length > 0 && !correction && !state.tripped && state.blocks < max;
    if (blocked) state.blocks++;
    state.tripped = state.blocks >= max;
    state.lastKey = key;
    const tmp = path + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, path);
    if (cfg.ledger.enabled) {
      const version = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version;
      appendFileSync(LEDGER_PATH, JSON.stringify({
        ts: new Date().toISOString(), agent, session, turn: input.turn_id || null,
        cwd: input.cwd || '', words: result.words, score: result.score,
        scoreVersion: result.scoreVersion, counts: result.counts,
        hard: result.hard.length, soft: result.soft.length, ...context,
        format: result.format, mode: cfg.mode, blocked, correction,
        version, voiceHash: voiceHash(), configHash: digest(effectiveConfigJson(cfg)).slice(0, 16),
        model: input.model || lastTranscriptModel(input.transcript_path),
      }) + '\n');
    }
    if (blocked) {
      const rules = [...new Set(hits.map((v) => v.rule))].join(', ');
      process.stdout.write(JSON.stringify({ decision: 'block', reason:
        `Laconia found these prose preferences: ${rules}. Revise wording only, preserving every fact, delivery state, citation and useful detail. Do not rerun work, use tools, change permissions or perform external actions. Preserve the user's explicit format and literal quotations or code over style preferences. Do not explain this style check. This is one correction request, not a guarantee of a clean reply.`
      }) + '\n');
    }
  }
} catch { /* A writing check must never break a coding turn. */ }
finally { if (lock) { try { rmSync(lock, { recursive: true, force: true }); } catch {} } }
