#!/usr/bin/env node
/**
 * laconia — the CLI.
 *
 *   node bin/laconia.mjs audit       measure your own agent's writing
 *   node bin/laconia.mjs install     wire it into every agent on this machine
 *   node bin/laconia.mjs lint FILE   check a draft before you send it
 */

import { readFileSync } from 'node:fs';
import { lint } from '../lib/lint.mjs';
import { collect } from '../lib/audit.mjs';
import { PKG_ROOT } from '../lib/paths.mjs';
import { loadConfig } from '../lib/config.mjs';

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

function version() {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

// -------------------------------------------------------------------- audit

async function cmdAudit() {
  const budgetMb = Number(val('max-mb', 100));
  if (!Number.isFinite(budgetMb) || budgetMb <= 0) throw new Error('max-mb must be positive');
  const tool = val('tool');
  if (tool && !['claude', 'codex'].includes(tool)) throw new Error('tool must be claude or codex');
  const per = collect({ budgetMb, tools: tool ? [tool] : ['claude', 'codex'] });
  out('Laconia transcript sample. Local reads only; mechanical style, not writing quality.');
  const cfg = loadConfig();
  for (const [agent, data] of Object.entries(per)) {
    out(agent + ': ' + data.records.length + ' final replies from ' + data.files + '/' + data.filesTotal + ' files.');
    for (const kind of ['routine', 'brief', 'depth', 'unknown']) {
      const records = data.records.filter((r) => r.requestClass === kind);
      if (!records.length) continue;
      const results = records.map((r) => lint(r.text, { ...cfg.lint, depthRequested: r.depthRequested }));
      const w = results.map((r) => r.words).sort((a, b) => a - b), m = Math.floor(w.length / 2);
      const median = w.length % 2 ? w[m] : (w[m - 1] + w[m]) / 2;
      out('  ' + kind + ': ' + records.length + ' replies, median ' + median + ' prose words.');
    }
    if (data.capped) out('  Incomplete sample: file budget skips some transcripts, including files larger than the limit.');
  }
  out('No before/after claim: this archive sample has no verified contract or model matching.');
  return 0;
}

// --------------------------------------------------------------------- lint

async function cmdLint() {
  const values = new Set(['--text', '--format']);
  const positionals = [];
  for (let i = 1; i < argv.length; i++) {
    if (values.has(argv[i])) { if (!argv[i + 1]) throw new Error(`${argv[i]} needs a value`); i++; }
    else if (!argv[i].startsWith('--')) positionals.push(argv[i]);
    else if (!['--depth', '--json'].includes(argv[i])) throw new Error(`unknown lint option ${argv[i]}`);
  }
  if (positionals.length > 1) throw new Error('lint accepts one file');
  const file = positionals[0];
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

  const cfg = loadConfig();
  const format = val('format', cfg.lint.format);
  if (!['chat', 'document', 'structured'].includes(format)) throw new Error('format must be chat, document or structured');
  const r = lint(body || '', { ...cfg.lint, depthRequested: has('depth'), format });

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
  return run({ mode, quiet: has('quiet'), agent: val('agent', 'both') });
}

// ------------------------------------------------------------------- report

async function cmdReport() {
  const { report } = await import('../lib/report.mjs');
  const token = argv.slice(1).find((arg) => !arg.startsWith('--'));
  const days = token === undefined ? 7 : Number(token);
  if (!Number.isFinite(days) || days < 0) throw new Error('days must be a nonnegative number');
  return report({ days, json: has('json') });
}

// --------------------------------------------------------------------- help

function help() {
  out(`
  ${bold('laconia')} ${dim('v' + version())}   clear, natural coding-agent replies

  ${bold('node bin/laconia.mjs audit')}            measure your own agent's writing, locally
  ${bold('node bin/laconia.mjs install')}          wire it into every agent on this machine
  ${bold('node bin/laconia.mjs lint')} FILE        check a draft before you send it
  ${bold('node bin/laconia.mjs report')} [DAYS]    mechanical style by agent
  ${bold('node bin/laconia.mjs check')}            configuration and drift checks
  ${bold('node bin/laconia.mjs uninstall')}        remove it

  ${dim('audit')}      --max-mb N     how much transcript to read (default 100)
             --tool NAME    claude or codex, default both
  ${dim('lint')}       --text "..."   lint a string instead of a file
             --json         machine-readable output
             --depth        allow the longer word budget
             --format F     chat, document or structured
  install    --agent NAME   claude, codex or both (default both)
  report     --json         version-aware report data; 0 days = all history

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
