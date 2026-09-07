import { readFileSync, existsSync } from 'node:fs';
import { LEDGER_PATH } from './paths.mjs';

export function readLedger({ days = 0, now = Date.now() } = {}) {
  if (!existsSync(LEDGER_PATH)) return null;
  const cutoff = days ? now - days * 864e5 : -Infinity;
  return readFileSync(LEDGER_PATH, 'utf8').split('\n').flatMap((line) => {
    try {
      const r = JSON.parse(line);
      return Number.isFinite(Date.parse(r.ts)) && Number.isFinite(r.words) && Number.isFinite(r.score)
        && Date.parse(r.ts) >= cutoff && Date.parse(r.ts) <= now ? [r] : [];
    } catch { return []; }
  }).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

export function summarise(rows) {
  if (!rows.length) return null;
  const w = rows.map((r) => r.words).sort((a, b) => a - b);
  const middle = Math.floor(w.length / 2);
  const hit = (test) => 100 * rows.filter(test).length / rows.length;
  return { n: rows.length, medianWords: w.length % 2 ? w[middle] : (w[middle - 1] + w[middle]) / 2,
    meanScore: rows.reduce((s, r) => s + r.score, 0) / rows.length,
    cleanPct: hit((r) => !r.hard && !r.soft),
    emDashPct: hit((r) => (r.counts?.['em-dash'] || 0) > 0),
    blockedPct: hit((r) => r.blocked === true) };
}

export function buildReport(rows, { days = 7, now = Date.now() } = {}) {
  const end = now, start = days ? now - days * 864e5 : -Infinity;
  const priorStart = days ? start - days * 864e5 : -Infinity;
  const valid = rows.filter((r) => Number.isFinite(Date.parse(r.ts)) && Number.isFinite(r.words) && Number.isFinite(r.score) && Date.parse(r.ts) <= end);
  const current = valid.filter((r) => Date.parse(r.ts) >= start);
  const groups = new Map();
  for (const r of valid.filter((r) => Date.parse(r.ts) >= priorStart)) {
    const identity = { agent: r.agent || 'unknown', requestClass: r.requestClass || (r.depthRequested === true ? 'depth' : 'unknown'), correction: r.correction === true,
      scoreVersion: r.scoreVersion || 1, version: r.version || 'unknown', voiceHash: r.voiceHash || 'unknown', configHash: r.configHash || 'unknown', model: r.model || 'unknown' };
    const key = JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key, { ...identity, current: [], baseline: [] });
    groups.get(key)[Date.parse(r.ts) >= start ? 'current' : 'baseline'].push(r);
  }
  return { days, from: days ? new Date(start).toISOString() : null, to: new Date(end).toISOString(),
    n: current.length, agents: [...new Set(current.map((r) => r.agent || 'unknown'))].sort().map((agent) => ({agent, summary: summarise(current.filter((r) => (r.agent || 'unknown') === agent))})),
    groups: [...groups.values()].filter((g) => g.current.length).map((g) => {
      const current = summarise(g.current), baseline = days ? summarise(g.baseline) : null;
      const comparable = !!baseline && baseline.n >= 10 && current.n >= 10 && g.voiceHash !== 'unknown' && g.configHash !== 'unknown' && g.requestClass !== 'unknown' && g.model !== 'unknown';
      return { ...g, current, baseline, comparable, deltaWords: comparable ? current.medianWords - baseline.medianWords : null };
    }),
    caveat: 'Mechanical style only. Different tasks and unobserved sessions prevent causal claims about quality. Corrections are separate. Baselines use the preceding, non-overlapping window and matching agent, request class, model, contract, config and score version.',
  };
}

export function report({ days = 7, json = false } = {}) {
  const result = buildReport(readLedger({}) || [], { days });
  if (json) { console.log(JSON.stringify(result, null, 2)); return 0; }
  console.log(`\nLaconia: ${result.n} recorded replies${days ? ` in the last ${days} days` : ' in all history'}.`);
  for (const {agent, summary:s} of result.agents) {
    console.log(`  ${agent}: ${s.n} replies, median ${s.medianWords} words, ${s.cleanPct.toFixed(1)}% mechanically clean, ${s.blockedPct.toFixed(1)}% correction requests.`);
  }
  for (const g of result.groups) if (g.comparable) console.log(`  ${g.agent}/${g.requestClass}: median-word change ${g.deltaWords >= 0 ? '+' : ''}${g.deltaWords} against the preceding ${days} days (matching versions).`);
  if (!result.groups.some((g) => g.comparable)) console.log('  No sufficiently sized, comparable baseline for a trend.');
  console.log('\n' + result.caveat + '\n');
  return 0;
}
