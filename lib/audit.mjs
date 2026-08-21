/**
 * Measure your own agent's writing.
 *
 * Reads the transcripts already on this machine, extracts the messages that
 * ended a turn (the ones a human actually read), and scores them. Nothing is
 * uploaded, nothing is sent anywhere, no model is called. It is a local file
 * read and some regexes.
 *
 * This exists because "your agent writes too much" is an opinion until you see
 * your own median.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { lint } from './lint.mjs';
import { CLAUDE_PROJECTS_DIR, CODEX_SESSIONS_DIR } from './paths.mjs';

const DEFAULT_BUDGET_MB = 400;

function walk(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

function pickRecent(files, budgetBytes) {
  const stated = [];
  for (const p of files) {
    try {
      const s = statSync(p);
      stated.push({ p, size: s.size, mtime: s.mtimeMs });
    } catch { /* vanished mid-scan */ }
  }
  stated.sort((a, b) => b.mtime - a.mtime);
  const picked = [];
  let used = 0;
  for (const f of stated) {
    if (used + f.size > budgetBytes) continue;
    used += f.size;
    picked.push(f.p);
  }
  return { picked, used, total: stated.length };
}

/** Claude Code: the last text block of the last assistant message before a real user turn. */
function claudeFinals(path, out) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return; }
  let pending = null;
  for (const line of raw.split('\n')) {
    if (!line.startsWith('{')) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.isSidechain) continue;
    const m = rec.message;
    if (rec.type === 'assistant' && m && Array.isArray(m.content)) {
      const usedTool = m.content.some((b) => b && b.type === 'tool_use');
      for (const b of m.content) {
        if (b && b.type === 'text' && (b.text || '').trim()) pending = { text: b.text, usedTool };
      }
    } else if (rec.type === 'user' && m) {
      const c = m.content;
      if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) continue;
      if (pending && !pending.usedTool) out.push(pending.text);
      pending = null;
    }
  }
  if (pending && !pending.usedTool) out.push(pending.text);
}

/** Codex marks the turn-ending message itself: payload.phase === 'final_answer'. */
function codexFinals(path, out) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return; }
  for (const line of raw.split('\n')) {
    if (!line.startsWith('{')) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.type !== 'response_item') continue;
    const p = rec.payload;
    if (!p || p.role !== 'assistant' || p.phase !== 'final_answer') continue;
    const text = (p.content || [])
      .filter((c) => c && (c.type === 'output_text' || c.type === 'text'))
      .map((c) => c.text || '')
      .join('\n')
      .trim();
    if (text) out.push(text);
  }
}

export function collect({ budgetMb = DEFAULT_BUDGET_MB, tools = ['claude', 'codex'] } = {}) {
  const budget = budgetMb * 1024 * 1024;
  const sources = [];

  if (tools.includes('claude') && existsSync(CLAUDE_PROJECTS_DIR)) {
    sources.push({ tool: 'claude', dir: CLAUDE_PROJECTS_DIR, parse: claudeFinals });
  }
  if (tools.includes('codex') && existsSync(CODEX_SESSIONS_DIR)) {
    sources.push({ tool: 'codex', dir: CODEX_SESSIONS_DIR, parse: codexFinals });
  }

  const per = {};
  for (const s of sources) {
    // Budget is per tool, not split between them. Splitting starved whichever
    // corpus was larger and produced a sample too small to mean anything.
    const files = walk(s.dir);
    const { picked, used, total } = pickRecent(files, budget);
    const finals = [];
    for (const f of picked) s.parse(f, finals);
    per[s.tool] = { finals, files: picked.length, filesTotal: total, bytes: used, capped: picked.length < total };
  }
  return per;
}

export function score(finals) {
  const results = finals.map((t) => lint(t));
  const n = results.length || 1;
  const words = results.map((r) => r.words).sort((a, b) => a - b);
  const scores = results.map((r) => r.score);
  const q = (arr, p) => (arr.length ? arr[Math.round(p * (arr.length - 1))] : 0);
  const hitPct = (rule) => (100 * results.filter((r) => (r.counts[rule] || 0) > 0).length) / n;

  return {
    n: results.length,
    medianWords: q(words, 0.5),
    p90Words: q(words, 0.9),
    maxWords: words[words.length - 1] || 0,
    meanScore: scores.reduce((a, b) => a + b, 0) / n,
    cleanPct: (100 * results.filter((r) => r.clean).length) / n,
    emDashPct: hitPct('em-dash'),
    emDashPerMsg: results.reduce((a, r) => a + (r.counts['em-dash'] || 0), 0) / n,
    boldPct: hitPct('bold-density'),
    bulletPct: hitPct('inline-header-bullet'),
    headerPct: hitPct('header-in-short-reply'),
    tablePct: hitPct('table'),
    offerPct: hitPct('trailing-offer'),
    negParPct: hitPct('negative-parallelism'),
    vocabPct: hitPct('ai-vocab'),
    emojiPct: hitPct('emoji'),
    over250: (100 * results.filter((r) => r.words > 250) .length) / n,
    worst: results
      .map((r, i) => ({ r, text: finals[i] }))
      .sort((a, b) => b.r.score - a.r.score)
      .slice(0, 3),
  };
}
