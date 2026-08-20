#!/usr/bin/env node
/**
 * Laconia installer. Wires this directory into every agent CLI on the machine.
 *
 *   node install.mjs           install / repair, idempotent
 *   node install.mjs --check   report what is wired, change nothing
 *   node install.mjs --uninstall
 *
 * Claude Code needs nothing: this directory living at ~/.claude/skills/laconia
 * IS the install, and it auto-loads as laconia@skills-dir.
 *
 * Codex is the work. It has its own hooks (~/.codex/hooks.json) with the same
 * Stop block-and-rewrite contract, and its own global instructions file
 * (~/.codex/AGENTS.md). Both get written here with absolute paths resolved for
 * this machine, which is what makes the same repo work on Windows and macOS.
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const CODEX_HOME = process.env.CODEX_HOME || join(HOME, '.codex');
const CLAUDE_SKILL_DIR = join(HOME, '.claude', 'skills', 'laconia');

const MARK_START = '<!-- laconia:start -->';
const MARK_END = '<!-- laconia:end -->';
const HOOK_TAG = 'laconia';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const UNINSTALL = args.includes('--uninstall');

const log = (s) => console.log(s);
const ok = (s) => log(`  ok      ${s}`);
const add = (s) => log(`  wrote   ${s}`);
const skip = (s) => log(`  skip    ${s}`);
const warn = (s) => log(`  note    ${s}`);

/** Never overwrite a user file without leaving the previous version behind. */
function backup(path) {
  if (!existsSync(path)) return;
  const b = `${path}.laconia-bak`;
  try { copyFileSync(path, b); } catch {}
}

function writeAtomic(path, text) {
  const tmp = `${path}.laconia-tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

/**
 * The voice contract, with the Claude-specific frontmatter and the
 * "# Output Style" heading stripped, so it drops cleanly under a heading of
 * our own in AGENTS.md. One source of truth: edit output-styles/laconia.md and
 * re-run this installer.
 */
function voiceProse() {
  const raw = readFileSync(join(ROOT, 'output-styles', 'laconia.md'), 'utf8');
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (m ? m[1] : raw).replace(/^\s*#\s*Output Style:.*\r?\n+/, '').trim();
}

// ---------------------------------------------------------------- claude code

function claudeCode() {
  log('\nClaude Code');
  const here = resolve(ROOT);
  const want = resolve(CLAUDE_SKILL_DIR);
  if (here.toLowerCase() === want.toLowerCase()) {
    ok(`plugin lives at ${CLAUDE_SKILL_DIR}, auto-loads as laconia@skills-dir`);
  } else {
    warn(`this repo is at ${here}`);
    warn(`Claude Code auto-loads from ${want}`);
    warn('clone or move it there, or symlink it, then restart your sessions');
  }
  ok('output style, hooks and skill are read from this directory directly');
}

// --------------------------------------------------------------------- codex

const codexHooks = () => ({
  Stop: [
    {
      hooks: [
        {
          type: 'command',
          command: `node "${join(ROOT, 'scripts', 'stop-gate.mjs').replace(/\\/g, '/')}" --agent codex`,
          commandWindows: `node "${join(ROOT, 'scripts', 'stop-gate.mjs')}" --agent codex`,
          timeout: 15,
          statusMessage: 'Laconia: checking the reply',
          [`x-${HOOK_TAG}`]: true,
        },
      ],
    },
  ],
});

function codexInstall() {
  log('\nCodex');
  if (!existsSync(CODEX_HOME)) {
    skip(`no ${CODEX_HOME}, Codex not installed here`);
    return;
  }

  // --- hooks.json ---------------------------------------------------------
  const hp = join(CODEX_HOME, 'hooks.json');
  let doc = { description: 'Lifecycle hooks.', hooks: {} };
  if (existsSync(hp)) {
    try { doc = JSON.parse(readFileSync(hp, 'utf8')); } catch {
      warn(`${hp} is not valid JSON, leaving it alone`);
      return;
    }
    doc.hooks ||= {};
  }

  const isOurs = (group) =>
    (group.hooks || []).some((h) => h[`x-${HOOK_TAG}`] || String(h.command || '').includes('laconia'));

  const mine = codexHooks();

  if (CHECK) {
    // Inspect what is on disk, never the copy we are about to build.
    const present = Object.keys(mine).filter((e) => (doc.hooks[e] || []).some(isOurs));
    present.length ? ok(`hooks wired: ${present.join(', ')}`) : skip('Stop gate not wired');
  }

  for (const [event, groups] of Object.entries(mine)) {
    doc.hooks[event] = (doc.hooks[event] || []).filter((g) => !isOurs(g));
    if (!UNINSTALL) doc.hooks[event].push(...groups);
    if (!doc.hooks[event].length) delete doc.hooks[event];
  }

  if (!CHECK) {
    backup(hp);
    writeAtomic(hp, JSON.stringify(doc, null, 2) + '\n');
    add(`${hp} (Stop gate${UNINSTALL ? ' removed' : ''})`);
    if (!UNINSTALL) {
      warn('Codex requires you to trust a new hook before it runs.');
      warn('Open Codex and run /hooks, then review and trust the Laconia entry.');
    }
  }

  // --- AGENTS.md ----------------------------------------------------------
  const ap = join(CODEX_HOME, 'AGENTS.md');
  let text = existsSync(ap) ? readFileSync(ap, 'utf8') : '';
  const block = [
    MARK_START,
    '',
    '# How to write to Marko',
    '',
    'Managed by Laconia (`~/.claude/skills/laconia`). Edit the source, not this block:',
    'running `node install.mjs` rewrites everything between the markers.',
    '',
    voiceProse(),
    '',
    '## Codex-specific',
    '',
    'Web research is done in a real browser, never with the hosted web search and',
    'never by quoting a search summary as the finding. The Playwright MCP is already',
    'configured in `~/.codex/config.toml`: navigate, then read the page. Marko has',
    'asked for this six separate times. Codex hooks cannot block the hosted search',
    'tool, so on Codex this one is on you.',
    '',
    MARK_END,
  ].join('\n');

  const has = text.includes(MARK_START) && text.includes(MARK_END);
  const next = has
    ? text.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`), UNINSTALL ? '' : block)
    : UNINSTALL ? text : (text.trim() ? `${text.trim()}\n\n${block}\n` : `${block}\n`);

  if (CHECK) {
    has ? ok(`voice contract present in ${ap}`) : skip(`voice contract missing from ${ap}`);
  } else {
    mkdirSync(CODEX_HOME, { recursive: true });
    backup(ap);
    writeAtomic(ap, next.replace(/\n{3,}/g, '\n\n').trimStart());
    add(`${ap} (voice contract${UNINSTALL ? ' removed' : ''}, ${voiceProse().split('\n').length} lines, well under the 32 KiB cap)`);
  }
}

// ---------------------------------------------------------------------- other

function others() {
  log('\nOther agents');
  const opencode = join(HOME, '.config', 'opencode');
  if (existsSync(opencode) || existsSync(join(HOME, '.opencode'))) {
    warn('opencode is installed but not wired. Say the word and I will add it.');
  }
  warn('Athena\'s own agent is a separate system (ADR-050 already covers terseness).');
  warn('Claude Code subagents run their own system prompt, so the style does not reach them.');
}

// ----------------------------------------------------------------------- main

log(UNINSTALL ? 'Laconia uninstall' : CHECK ? 'Laconia status' : 'Laconia install');
log(`  source  ${ROOT}`);
claudeCode();
codexInstall();
others();

if (!CHECK) {
  log('\nRestart any running sessions. Hooks and system prompts are read at session start.');
}
log('');
