/**
 * Reads the ledger and answers the only question that matters: did it work?
 *
 * Compares the last N days against your own first week, not against someone
 * else's numbers. If there is not enough history yet it says so instead of
 * inventing a trend.
 */

import { readFileSync, existsSync } from 'node:fs';
import { LEDGER_PATH } from './paths.mjs';

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function readLedger({ days = 0 } = {}) {
  if (!existsSync(LEDGER_PATH)) return null;
  const cutoff = days ? Date.now() - days * 864e5 : 0;
  return readFileSync(LEDGER_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .filter((r) => !cutoff || new Date(r.ts).getTime() >= cutoff);
}

function summarise(rows) {
  const n = rows.length || 1;
  const hit = (rule) => (100 * rows.filter((r) => (r.counts?.[rule] || 0) > 0).length) / n;
  return {
    n: rows.length,
    medianWords: med(rows.map((r) => r.words)),
    meanScore: mean(rows.map((r) => r.score)),
    cleanPct: (100 * rows.filter((r) => !r.hard && !r.soft).length) / n,
    emDashPct: hit('em-dash'),
    boldPct: hit('bold-density'),
    bulletPct: hit('inline-header-bullet'),
    blockedPct: (100 * rows.filter((r) => r.blocked).length) / n,
  };
}

export function report({ days = 0 } = {}) {
  const rows = readLedger({ days });

  if (!rows) {
    console.log('\nNo ledger yet. It fills up one line per reply as you work.');
    console.log(`Expected at: ${LEDGER_PATH}`);
    console.log('Run `laconia audit` in the meantime to see where you are starting from.\n');
    return 0;
  }
  if (!rows.length) {
    console.log('\nLedger is empty for that window.\n');
    return 0;
  }

  const now = summarise(rows);
  console.log(`\nLaconia  ${now.n} replies${days ? ` over the last ${days} days` : ''}\n`);

  // Compare against this user's own earliest 100 replies, not a stranger's numbers.
  const all = readLedger({}) || [];
  const baseline = all.length >= 60 ? summarise(all.slice(0, Math.min(100, Math.floor(all.length / 3)))) : null;

  const line = (label, value, before, unit = '', lower = true) => {
    if (before === null) {
      console.log(`  ${label.padEnd(26)} ${String(value.toFixed(1) + unit).padStart(9)}`);
      return;
    }
    const d = value - before;
    const better = lower ? d < 0 : d > 0;
    const tag = Math.abs(d) < 0.05 ? 'flat' : better ? 'better' : 'worse';
    console.log(`  ${label.padEnd(26)} ${String(value.toFixed(1) + unit).padStart(9)}` +
      `   was ${String(before.toFixed(1) + unit).padStart(8)}   ${d > 0 ? '+' : ''}${d.toFixed(1)}  ${tag}`);
  };

  if (baseline) console.log('                                    now      your start    change');
  line('median words', now.medianWords, baseline?.medianWords ?? null);
  line('mean slop score', now.meanScore, baseline?.meanScore ?? null);
  line('clean replies', now.cleanPct, baseline?.cleanPct ?? null, '%', false);
  line('replies with an em dash', now.emDashPct, baseline?.emDashPct ?? null, '%');
  line('replies over bold budget', now.boldPct, baseline?.boldPct ?? null, '%');
  line('bold-headed bullets', now.bulletPct, baseline?.bulletPct ?? null, '%');

  if (!baseline) {
    console.log('\n  Not enough history to show a trend yet. Come back after a few days.');
  }

  console.log(`\n  gate fired on ${now.blockedPct.toFixed(1)}% of replies`);
  if (now.blockedPct > 25) {
    console.log('  That is high. The voice contract is not landing, which is the thing to fix,');
    console.log('  not the threshold. Check that your sessions restarted after install.');
  }

  const agents = {};
  for (const r of rows) (agents[r.agent || 'unknown'] ||= []).push(r);
  if (Object.keys(agents).length > 1) {
    console.log('\n  by agent:');
    for (const [a, rs] of Object.entries(agents).sort((x, y) => y[1].length - x[1].length)) {
      const s = summarise(rs);
      console.log(`    ${a.padEnd(10)} ${String(s.n).padStart(5)} replies   median ${String(s.medianWords).padStart(4)} words   ` +
        `score ${s.meanScore.toFixed(1).padStart(5)}   blocked ${s.blockedPct.toFixed(0)}%`);
    }
  }
  console.log('');
  return 0;
}
