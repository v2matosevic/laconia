/**
 * Wiring. Puts Laconia into every agent CLI on the machine and takes it out again.
 *
 * Two install routes exist and they are mutually exclusive by design:
 *
 *   Claude Code plugin marketplace  the plugin lives in Claude Code's own cache
 *   npx laconia install             the plugin is copied to ~/.claude/skills/laconia
 *
 * Both give Claude Code the same thing. Only the second can reach Codex, because
 * Codex has its own hooks file and its own global instructions file. `check`
 * reports every place a Laconia is found so a double install is visible rather
 * than mysterious.
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync,
  renameSync, readdirSync, rmSync,
} from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import {
  PKG_ROOT, LACONIA_HOME, CONFIG_PATH, LOCAL_VOICE_PATH, VOICE_PATH,
  CLAUDE_SKILLS_DIR, CODEX_HOME, ensureHome,
} from './paths.mjs';
import { seedConfig } from './config.mjs';

const MARK_START = '<!-- laconia:start -->';
const MARK_END = '<!-- laconia:end -->';
const HOOK_TAG = 'x-laconia';
const CLAUDE_TARGET = join(CLAUDE_SKILLS_DIR, 'laconia');

/** Never ship these into an install target. */
const SKIP = new Set(['.git', 'node_modules', 'test', '.github', '.gitignore']);

let QUIET = false;
const log = (s) => { if (!QUIET) console.log(s); };
const ok = (s) => log(`  ok      ${s}`);
const wrote = (s) => log(`  wrote   ${s}`);
const skip = (s) => log(`  skip    ${s}`);
const note = (s) => log(`  note    ${s}`);
const warn = (s) => log(`  warn    ${s}`);

function backup(path) {
  if (!existsSync(path)) return;
  try { copyFileSync(path, `${path}.laconia-bak`); } catch {}
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.laconia-tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const src = join(from, e.name);
    const dst = join(to, e.name);
    if (e.isDirectory()) copyTree(src, dst);
    else copyFileSync(src, dst);
  }
}

const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/**
 * The voice contract with the Claude-specific frontmatter stripped, plus the
 * user's own additions if they wrote any. One source of truth: edit the output
 * style, or ~/.laconia/voice.local.md, and re-run install.
 */
function voiceProse() {
  let raw = '';
  try { raw = readFileSync(VOICE_PATH, 'utf8'); } catch { return ''; }
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  let body = (m ? m[1] : raw).replace(/^\s*#\s*Output Style:.*\r?\n+/, '').trim();

  if (existsSync(LOCAL_VOICE_PATH)) {
    const local = readFileSync(LOCAL_VOICE_PATH, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('<!--')).join('\n').trim();
    if (local) body += `\n\n## Local additions\n\n${local}`;
  }
  return body;
}

const LOCAL_VOICE_TEMPLATE = `<!--
  Anything you write here is appended to the voice contract for every agent on
  this machine, then re-run \`laconia install\` to apply it. Use it for what is
  true of you and nobody else. Delete these comments and write plainly.

  Examples of what belongs here:
    - who is reading (a founder who does not code needs different altitude than
      a staff engineer reviewing your diff)
    - vocabulary you personally cannot stand
    - a language other than English, and how formal it should be
    - the one thing you keep having to say twice
-->
`;

// ------------------------------------------------------------------- claude

function claudeCode(mode) {
  log('\nClaude Code');

  if (mode === 'uninstall') {
    if (existsSync(CLAUDE_TARGET) && !samePath(PKG_ROOT, CLAUDE_TARGET)) {
      rmSync(CLAUDE_TARGET, { recursive: true, force: true });
      wrote(`removed ${CLAUDE_TARGET}`);
    } else if (samePath(PKG_ROOT, CLAUDE_TARGET)) {
      note('this repo IS the install; delete the directory to remove it');
    } else {
      skip('nothing installed');
    }
    return;
  }

  const inPlace = samePath(PKG_ROOT, CLAUDE_TARGET);

  if (mode === 'check') {
    if (inPlace) ok(`loaded from ${CLAUDE_TARGET} as laconia@skills-dir`);
    else if (existsSync(CLAUDE_TARGET)) ok(`installed at ${CLAUDE_TARGET}`);
    else skip(`not installed (no ${CLAUDE_TARGET})`);
    if (!inPlace && existsSync(CLAUDE_TARGET)) {
      note('you are running the CLI from somewhere else; that is fine');
    }
    return;
  }

  if (inPlace) {
    ok(`already in place at ${CLAUDE_TARGET}, auto-loads as laconia@skills-dir`);
  } else {
    copyTree(PKG_ROOT, CLAUDE_TARGET);
    wrote(`${CLAUDE_TARGET} (output style, hooks, skill)`);
  }
}

// -------------------------------------------------------------------- codex

function codexHookEntry(scriptPath) {
  return {
    hooks: [{
      type: 'command',
      command: `node "${scriptPath.replace(/\\/g, '/')}" --agent codex`,
      commandWindows: `node "${scriptPath}" --agent codex`,
      timeout: 15,
      statusMessage: 'Laconia: checking the reply',
      [HOOK_TAG]: true,
    }],
  };
}

function codex(mode) {
  log('\nCodex');
  if (!existsSync(CODEX_HOME)) {
    skip('not installed on this machine');
    return;
  }

  // Point Codex at whichever copy is the durable one.
  const base = existsSync(CLAUDE_TARGET) ? CLAUDE_TARGET : PKG_ROOT;
  const scriptPath = join(base, 'scripts', 'stop-gate.mjs');

  // --- hooks.json ---------------------------------------------------------
  const hp = join(CODEX_HOME, 'hooks.json');
  let doc = { description: 'Lifecycle hooks.', hooks: {} };
  if (existsSync(hp)) {
    try {
      doc = JSON.parse(readFileSync(hp, 'utf8'));
      doc.hooks ||= {};
    } catch {
      warn(`${hp} is not valid JSON, leaving it alone`);
      return;
    }
  }

  const isOurs = (g) => (g.hooks || []).some(
    (h) => h[HOOK_TAG] || String(h.command || '').includes('laconia')
  );

  if (mode === 'check') {
    (doc.hooks.Stop || []).some(isOurs) ? ok('Stop gate wired') : skip('Stop gate not wired');
  } else {
    doc.hooks.Stop = (doc.hooks.Stop || []).filter((g) => !isOurs(g));
    if (mode !== 'uninstall') doc.hooks.Stop.push(codexHookEntry(scriptPath));
    if (!doc.hooks.Stop.length) delete doc.hooks.Stop;
    backup(hp);
    writeAtomic(hp, JSON.stringify(doc, null, 2) + '\n');
    wrote(`${hp}${mode === 'uninstall' ? ' (gate removed)' : ''}`);
    if (mode !== 'uninstall') {
      note('Codex will not run a new hook until you trust it.');
      note('Open Codex, run /hooks, trust the Laconia entry. Once per machine.');
    }
  }

  // --- AGENTS.md ----------------------------------------------------------
  const ap = join(CODEX_HOME, 'AGENTS.md');
  const text = existsSync(ap) ? readFileSync(ap, 'utf8') : '';
  const has = text.includes(MARK_START) && text.includes(MARK_END);

  if (mode === 'check') {
    has ? ok('voice contract present in AGENTS.md') : skip('voice contract missing from AGENTS.md');
    return;
  }

  const block = [
    MARK_START,
    '',
    '# How to write',
    '',
    'Managed by Laconia. Edits between these markers are overwritten by',
    '`laconia install`. Change the source, or ~/.laconia/voice.local.md, instead.',
    '',
    voiceProse(),
    '',
    '## On Codex specifically',
    '',
    'Codex hooks cannot intercept the hosted web search tool, so if you care about',
    'reading real pages rather than a search summary, that discipline is on you here.',
    '',
    MARK_END,
  ].join('\n');

  const next = has
    ? text.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`), mode === 'uninstall' ? '' : block)
    : mode === 'uninstall' ? text
      : (text.trim() ? `${text.trim()}\n\n${block}\n` : `${block}\n`);

  backup(ap);
  writeAtomic(ap, next.replace(/\n{3,}/g, '\n\n').trimStart());
  wrote(`${ap}${mode === 'uninstall' ? ' (contract removed)' : ' (voice contract)'}`);
}

// ------------------------------------------------------------------ my stuff

function userHome(mode) {
  log('\nYour settings');
  if (mode === 'check') {
    existsSync(CONFIG_PATH) ? ok(CONFIG_PATH) : skip(`${CONFIG_PATH} not created yet`);
    existsSync(LOCAL_VOICE_PATH) ? ok(`${LOCAL_VOICE_PATH} (personal additions)`) : skip('no personal additions');
    return;
  }
  if (mode === 'uninstall') {
    note(`left ${LACONIA_HOME} alone: your config and ledger live there`);
    return;
  }
  ensureHome();
  seedConfig() ? wrote(CONFIG_PATH) : ok(`${CONFIG_PATH} (kept yours)`);
  if (!existsSync(LOCAL_VOICE_PATH)) {
    writeAtomic(LOCAL_VOICE_PATH, LOCAL_VOICE_TEMPLATE);
    wrote(`${LOCAL_VOICE_PATH} (empty, for anything personal)`);
  } else {
    ok(`${LOCAL_VOICE_PATH} (kept yours)`);
  }
}

// ---------------------------------------------------------------------- main

export function run({ mode = 'install', quiet = false } = {}) {
  QUIET = quiet;
  log(mode === 'uninstall' ? 'Laconia uninstall' : mode === 'check' ? 'Laconia status' : 'Laconia install');
  log(`  source  ${PKG_ROOT}`);

  claudeCode(mode);
  codex(mode);
  userHome(mode);

  if (mode === 'install') {
    log('\nRestart any running sessions. Hooks and system prompts load at session start.');
    log('Then: laconia audit    to see what it is up against.');
  }
  log('');
  return 0;
}
