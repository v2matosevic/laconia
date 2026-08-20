#!/usr/bin/env node
/**
 * Reads the ledger and answers the only question that matters: is any of this
 * working? Compares against the 21 Aug 2026 baseline measured over 1,199
 * turn-ending answers from the transcript archive.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LEDGER = join(homedir(), '.claude', 'laconia', 'ledger.jsonl');

/** Measured 2026-08-21 across 206 transcripts, before Laconia existed. */
const BASELINE = {
  medianWords: 311,
  meanScore: 40.7,
  cleanPct: 9.1,
  emDashPct: 90.4,
  boldPct: 64.6,
  bulletPct: 40.0,
};

if (!existsSync(LEDGER)) {
  console.log('No ledger yet. It fills up one line per reply as you work.');
  console.log(`Expected at: ${LEDGER}`);
  process.exit(0);
}

const days = Number(process.argv.find((a) => /^\d+$/.test(a))) || 0;
const cutoff = days ? Date.now() - days * 864e5 : 0;

const rows = readFileSync(LEDGER, 'utf8')
  .split('\n')
  .filter((l) => l.trim().startsWith('{'))
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean)
  .filter((r) => !cutoff || new Date(r.ts).getTime() >= cutoff);

if (!rows.length) {
  console.log('Ledger is empty for that window.');
  process.exit(0);
}

const n = rows.length;
const pct = (k) => (100 * k) / n;
const med = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const hit = (rule) => rows.filter((r) => (r.counts?.[rule] || 0) > 0).length;

const medianWords = med(rows.map((r) => r.words));
const meanScore = mean(rows.map((r) => r.score));
const cleanPct = pct(rows.filter((r) => !r.hard && !r.soft).length);
const blocked = rows.filter((r) => r.blocked).length;

const arrow = (now, base, lowerIsBetter = true) => {
  const d = now - base;
  const better = lowerIsBetter ? d < 0 : d > 0;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}  ${better ? 'better' : d === 0 ? 'flat' : 'WORSE'}`;
};

const line = (label, now, base, unit = '', lower = true) =>
  console.log(
    `  ${label.padEnd(26)} ${String(now.toFixed(1) + unit).padStart(9)}` +
    `   was ${String(base + unit).padStart(7)}   ${arrow(now, base, lower)}`
  );

console.log(`\nLaconia ledger  ${n} replies${days ? ` over the last ${days} days` : ''}\n`);
console.log('                                    now       baseline   change');
line('median words', medianWords, BASELINE.medianWords);
line('mean slop score', meanScore, BASELINE.meanScore);
line('clean replies', cleanPct, BASELINE.cleanPct, '%', false);
line('replies with an em dash', pct(hit('em-dash')), BASELINE.emDashPct, '%');
line('replies over bold budget', pct(hit('bold-density')), BASELINE.boldPct, '%');
line('bold-headed bullets', pct(hit('inline-header-bullet')), BASELINE.bulletPct, '%');

console.log(`\n  gate fired on ${blocked} of ${n} replies (${pct(blocked).toFixed(1)}%)`);

const agents = {};
for (const r of rows) (agents[r.agent || 'unknown'] ||= []).push(r);
if (Object.keys(agents).length > 1) {
  console.log('\n  by agent:');
  for (const [a, rs] of Object.entries(agents).sort((x, y) => y[1].length - x[1].length)) {
    const b = rs.filter((r) => r.blocked).length;
    console.log(`    ${a.padEnd(10)} ${String(rs.length).padStart(5)} replies   ` +
      `median ${String(med(rs.map((r) => r.words))).padStart(4)} words   ` +
      `mean score ${mean(rs.map((r) => r.score)).toFixed(1).padStart(5)}   ` +
      `blocked ${((100 * b) / rs.length).toFixed(0)}%`);
  }
}

const counts = {};
for (const r of rows) for (const [k, v] of Object.entries(r.counts || {})) counts[k] = (counts[k] || 0) + (v > 0 ? 1 : 0);
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
if (top.length) {
  console.log('\n  most common tells:');
  for (const [k, c] of top) console.log(`    ${k.padEnd(24)} ${String(c).padStart(5)}  ${pct(c).toFixed(1)}%`);
}

const worst = [...rows].sort((a, b) => b.score - a.score).slice(0, 3);
if (worst.length) {
  console.log('\n  worst replies logged:');
  for (const r of worst) {
    console.log(`    score ${String(r.score).padStart(5)}  ${r.words} words  ${r.ts.slice(0, 16).replace('T', ' ')}  ${r.cwd.split(/[\\/]/).pop() || ''}`);
  }
}
console.log('');
