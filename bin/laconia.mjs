#!/usr/bin/env node
/**
 * laconia — the CLI.
 *
 *   npx laconia audit       measure your own agent's writing
 *   npx laconia install     wire it into every agent on this machine
 *   npx laconia lint FILE   check a draft before you send it
 */

import { readFileSync } from 'node:fs';
import { lint } from '../lib/lint.mjs';
import { collect, score } from '../lib/audit.mjs';
import { PKG_ROOT } from '../lib/paths.mjs';

const argv = process.argv.slice(2);
const cmd = (argv[0] || '').replace(/^--/, '');
const has = (f) => argv.includes(`--${f}`);
const val = (f, d) => {
  const i = argv.indexOf(`--${f}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

// ------------------------------------------------------------------- colour

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const ESC = String.fromCharCode(27);
const c = (code) => (s) => (COLOR ? ESC + '[' + code + 'm' + s + ESC + '[0m' : String(s));
const bold = c(1);
const dim = c(2);
const red = c(31);
const green = c(32);
const yellow = c(33);
const cyan = c(36);

const out = (s = '') => process.stdout.write(s + '\n');

/** Measured over 1,199 turn-ending answers from one developer's archive, 2026-08-21. */
const REFERENCE = {
  medianWords: 311,
  emDashPct: 90.4,
  cleanPct: 9.1,
  bulletPct: 40.0,
};

function bar(pct, width = 24, tint = red) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return tint('█'.repeat(filled)) + dim('░'.repeat(width - filled));
}

function version() {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

// -------------------------------------------------------------------- audit

async function cmdAudit() {
  const budgetMb = Number(val('max-mb', 400));
  const tools = val('tool') ? [val('tool')] : ['claude', 'codex'];

  out();
  out(bold('  Laconia audit'));
  out(dim('  Reading transcripts already on this machine. Nothing is uploaded.'));
  out();

  const per = collect({ budgetMb, tools });
  const names = { claude: 'Claude Code', codex: 'Codex' };
  const all = [];
  let any = false;
  let capped = false;

  for (const [tool, data] of Object.entries(per)) {
    if (!data.finals.length) {
      out(`  ${dim(names[tool] + ': no turn-ending replies found')}`);
      continue;
    }
    any = true;
    all.push(...data.finals);
    out(`  ${bold(names[tool])}  ${dim(`${data.finals.length} replies from ${data.files} of ${data.filesTotal} transcripts, ${(data.bytes / 1048576).toFixed(0)} MB`)}`);
    if (data.capped) capped = true;
  }
  if (capped) out(`  ${dim(`Reading the most recent ${budgetMb} MB per tool. Raise it with --max-mb.`)}`);

  if (!any) {
    out();
    out(`  ${yellow('No transcripts found.')}`);
    out(dim('  Looked in ~/.claude/projects and ~/.codex/sessions.'));
    out(dim('  Use --max-mb to widen the scan, or run this on the machine you code on.'));
    out();
    return 0;
  }

  const s = score(all);
  out();
  out(`  ${bold('Your turn-ending replies')}  ${dim(`n=${s.n}`)}`);
  out();

  const row = (label, value, ref, unit = '', lowerIsBetter = true) => {
    const good = lowerIsBetter ? value <= ref : value >= ref;
    const tint = good ? green : red;
    out(`    ${label.padEnd(26)} ${tint(String(value.toFixed(unit === '%' ? 1 : 0) + unit).padStart(8))}   ` +
      `${bar(unit === '%' ? value : Math.min(100, (value / (ref * 2)) * 100), 20, tint)}  ${dim('ref ' + ref + unit)}`);
  };

  row('median words', s.medianWords, REFERENCE.medianWords);
  row('replies with an em dash', s.emDashPct, REFERENCE.emDashPct, '%');
  row('bold-headed bullets', s.bulletPct, REFERENCE.bulletPct, '%');
  row('clean replies', s.cleanPct, REFERENCE.cleanPct, '%', false);

  out();
  out(`    ${dim('longest reply')} ${bold(s.maxWords + ' words')}   ` +
    `${dim('over 250 words')} ${bold(s.over250.toFixed(0) + '%')}   ` +
    `${dim('em dashes per reply')} ${bold(s.emDashPerMsg.toFixed(1))}`);
  out();

  const tells = [
    ['em dash', s.emDashPct],
    ['bold over budget', s.boldPct],
    ['bold-headed bullet', s.bulletPct],
    ['table in a reply', s.tablePct],
    ['header in a short reply', s.headerPct],
    ['trailing offer', s.offerPct],
    ['"not just X but Y"', s.negParPct],
    ['emoji as formatting', s.emojiPct],
    ['AI vocabulary', s.vocabPct],
  ].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  if (tells.length) {
    out(`  ${bold('Where the slop is')}`);
    out();
    for (const [name, pct] of tells) {
      out(`    ${name.padEnd(26)} ${String(pct.toFixed(1) + '%').padStart(7)}  ${bar(pct, 24, pct > 30 ? red : yellow)}`);
    }
    out();
  }

  if (s.worst[0] && s.worst[0].r.score > 0) {
    const w = s.worst[0];
    out(`  ${bold('Your worst reply')}  ${dim(`score ${w.r.score}, ${w.r.words} words`)}`);
    out();
    const snippet = w.text.replace(/\s+/g, ' ').slice(0, 220);
    out(`    ${dim(snippet + (w.text.length > 220 ? '…' : ''))}`);
    out();
  }

  const verdict = s.medianWords > 200 || s.emDashPct > 50;
  out(verdict
    ? `  ${red('That is a lot of words nobody asked for.')}  ${dim('Fix it: npx laconia install')}`
    : `  ${green('Not bad.')}  ${dim('Keep it that way: npx laconia install')}`);
  out();
  return 0;
}

// --------------------------------------------------------------------- lint

async function cmdLint() {
  const file = argv.slice(1).find((a) => !a.startsWith('--'));
  const text = val('text');

  const readStdin = () => new Promise((res) => {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (x) => (d += x));
    process.stdin.on('end', () => res(d));
  });

  let body = text;
  if (body === undefined && file) body = readFileSync(file, 'utf8');
  if (body === undefined) body = await readStdin();

  const r = lint(body || '', { depthRequested: has('depth') });

  if (has('json')) {
    out(JSON.stringify(r, null, 2));
    return r.hard.length ? 1 : 0;
  }

  if (r.clean) {
    out(`${green('clean')}  ${r.words} words  score ${r.score}`);
    return 0;
  }

  out(`${r.words} words  score ${bold(r.score)}  ${red(r.hard.length + ' hard')}, ${yellow(r.soft.length + ' soft')}`);
  out();
  for (const v of r.violations) {
    const tag = v.severity === 'hard' ? red('HARD') : yellow('soft');
    out(`  ${dim(String(v.line).padStart(4))}  ${tag}  ${bold(v.rule)}`);
    out(`        ${v.message}`);
  }
  out();
  return r.hard.length ? 1 : 0;
}

// ------------------------------------------------------------------ install

async function cmdInstall(mode) {
  const { run } = await import('../lib/install.mjs');
  return run({ mode, quiet: has('quiet') });
}

// ------------------------------------------------------------------- report

async function cmdReport() {
  const { report } = await import('../lib/report.mjs');
  return report({ days: Number(argv[1]) || 0 });
}

// --------------------------------------------------------------------- help

function help() {
  out(`
  ${bold('laconia')} ${dim('v' + version())}   makes your coding agent write like a person

  ${bold('npx laconia audit')}            measure your own agent's writing, locally
  ${bold('npx laconia install')}          wire it into every agent on this machine
  ${bold('npx laconia lint')} FILE        check a draft before you send it
  ${bold('npx laconia report')} [DAYS]    has it actually improved?
  ${bold('npx laconia check')}            what is wired right now
  ${bold('npx laconia uninstall')}        remove it

  ${dim('audit')}      --max-mb N     how much transcript to read (default 400)
             --tool NAME    claude or codex, default both
  ${dim('lint')}       --text "..."   lint a string instead of a file
             --json         machine-readable output
             --depth        allow the longer word budget

  ${dim(PKG_ROOT)}
`);
  return 0;
}

// --------------------------------------------------------------------- main

const table = {
  audit: cmdAudit,
  lint: cmdLint,
  install: () => cmdInstall('install'),
  check: () => cmdInstall('check'),
  status: () => cmdInstall('check'),
  uninstall: () => cmdInstall('uninstall'),
  report: cmdReport,
  version: () => (out(version()), 0),
  v: () => (out(version()), 0),
  help: help,
  h: help,
  '': help,
};

const fn = table[cmd];
if (!fn) {
  out(`${red('unknown command')} ${cmd}`);
  help();
  process.exit(1);
}

try {
  process.exit((await fn()) || 0);
} catch (err) {
  out(`${red('error')} ${err && err.message ? err.message : err}`);
  process.exit(1);
}
