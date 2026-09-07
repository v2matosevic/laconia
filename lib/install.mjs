/**
 * CLI integration for the explicitly selected Claude/Codex profile directories.
 * Native marketplace plugins are an alternative, never installed or trusted here.
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync,
  renameSync, readdirSync, rmSync,
} from 'node:fs';
import { join, resolve, relative, dirname, isAbsolute, sep } from 'node:path';
import {
  PKG_ROOT, LACONIA_HOME, CONFIG_PATH, LOCAL_VOICE_PATH,
  CLAUDE_HOME, CLAUDE_SKILLS_DIR, CODEX_HOME, ensureHome,
} from './paths.mjs';
import { seedConfig, configStatus } from './config.mjs';
import { composeVoice } from './voice.mjs';
import { readLedger } from './report.mjs';

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
  copyFileSync(path, `${path}.laconia-bak`);
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
    if (SKIP.has(e.name) || e.name.endsWith('.laconia-bak') || e.name.endsWith('.laconia-tmp')) continue;
    const src = join(from, e.name);
    const dst = join(to, e.name);
    if (e.isDirectory()) copyTree(src, dst);
    else copyFileSync(src, dst);
  }
}

const samePath = (a, b) => process.platform === 'win32'
  ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

/**
 * Is there also a marketplace-installed copy? The two install routes collide by
 * plugin name: Claude Code loads the marketplace one and ignores ~/.claude/skills,
 * which is confusing if you do not know it is happening.
 */
function marketplaceInstalled() {
  for (const f of ['settings.json', 'settings.local.json']) {
    try {
      const s = JSON.parse(readFileSync(join(CLAUDE_HOME, f), 'utf8'));
      const keys = Object.entries(s.enabledPlugins || {}).filter(([, enabled]) => enabled === true).map(([key]) => key);
      if (keys.some((k) => k.startsWith('laconia@') && !k.endsWith('@skills-dir'))) return true;
    } catch { /* absent or malformed, treat as no */ }
  }
  return false;
}

/**
 * The voice contract with the Claude-specific frontmatter stripped, plus the
 * user's own additions if they wrote any. One source of truth: edit the output
 * style, or ~/.laconia/voice.local.md, and re-run install.
 */
const voiceProse = composeVoice;

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
    const path = join(CLAUDE_HOME, 'settings.json');
    const doc = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
    doc.enabledPlugins ||= {};
    doc.enabledPlugins['laconia@skills-dir'] = false;
    backup(path);
    writeAtomic(path, JSON.stringify(doc, null, 2) + '\n');
    note('disabled laconia@skills-dir; retained source and user files');
    if (marketplaceInstalled()) warn('marketplace route remains enabled; use /plugin uninstall laconia@laconia for that route');
    return;
  }

  const inPlace = samePath(PKG_ROOT, CLAUDE_TARGET);

  if (mode === 'check') {
    if (inPlace) ok(`source present at ${CLAUDE_TARGET} (runtime loading not inferred)`);
    else if (existsSync(CLAUDE_TARGET)) ok(`installed at ${CLAUDE_TARGET}`);
    else skip(`not installed (no ${CLAUDE_TARGET})`);
    if (!inPlace && existsSync(CLAUDE_TARGET)) {
      note('you are running the CLI from somewhere else; that is fine');
    }
    if (marketplaceInstalled() && existsSync(CLAUDE_TARGET)) {
      warn('installed twice: once from a marketplace and once in ~/.claude/skills.');
      warn('Claude Code loads the marketplace copy and ignores the other. Pick one:');
      warn('  /plugin uninstall laconia@laconia    keep the ~/.claude/skills copy');
      warn('or disable laconia@skills-dir to keep the marketplace copy');
    }
    const settings = join(CLAUDE_HOME, 'settings.json');
    const enabled = existsSync(settings) ? JSON.parse(readFileSync(settings, 'utf8')).enabledPlugins?.['laconia@skills-dir'] : undefined;
    if (enabled === false) warn('laconia@skills-dir is explicitly disabled');
    note('personal preferences load through SessionStart; start a new session after editing');
    return;
  }

  if (inPlace) {
    ok(`already in place at ${CLAUDE_TARGET}, auto-loads as laconia@skills-dir`);
  } else {
    copyTree(PKG_ROOT, CLAUDE_TARGET);
    wrote(`${CLAUDE_TARGET} (output style, hooks, skill)`);
  }
  const settings = join(CLAUDE_HOME, 'settings.json');
  const doc = existsSync(settings) ? JSON.parse(readFileSync(settings, 'utf8')) : {};
  // Explicit install re-enables our own local route, preserving all other settings.
  if (doc.enabledPlugins?.['laconia@skills-dir'] === false) {
    doc.enabledPlugins['laconia@skills-dir'] = true;
    backup(settings);
    writeAtomic(settings, JSON.stringify(doc, null, 2) + '\n');
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

  // Codex-only installs must survive a downloaded source/cache disappearing.
  const base = join(LACONIA_HOME, 'runtime');
  if (mode === 'install' && !samePath(PKG_ROOT, base)) copyTree(PKG_ROOT, base);
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

  const ownedHook = (h) => h[HOOK_TAG] === true || /[\\/]laconia[\\/]scripts[\\/]stop-gate\.mjs/.test(String(h.command || ''));
  const isOurs = (g) => (g.hooks || []).some(ownedHook);

  if (mode === 'check') {
    (doc.hooks.Stop || []).some(isOurs) ? ok('Stop hook configured (trust and execution unknown)') : skip('Stop gate not wired');
    if (!existsSync(scriptPath)) warn('durable runtime missing; legacy source hook may still be configured');
  } else {
    // Never remove a peer's handler just because it shares our matcher group.
    doc.hooks.Stop = (doc.hooks.Stop || []).map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !ownedHook(h)) })).filter((g) => g.hooks.length);
    if (mode !== 'uninstall') doc.hooks.Stop.push(codexHookEntry(scriptPath));
    if (!doc.hooks.Stop.length) delete doc.hooks.Stop;
    backup(hp);
    writeAtomic(hp, JSON.stringify(doc, null, 2) + '\n');
    wrote(`${hp}${mode === 'uninstall' ? ' (gate removed)' : ''}`);
    if (mode !== 'uninstall') {
      note('Codex will not run a new hook until you trust it.');
      note('Open Codex, run /hooks, review new or changed Laconia definitions.');
    }
  }

  // --- AGENTS.md ----------------------------------------------------------
  const ap = join(CODEX_HOME, 'AGENTS.md');
  const text = existsSync(ap) ? readFileSync(ap, 'utf8') : '';
  const has = text.includes(MARK_START) && text.includes(MARK_END);

  const block = [MARK_START, '', '# How to write', '',
    'Managed by Laconia. Edit ~/.laconia/voice.local.md, then rerun the installer.',
    '', voiceProse(), '', MARK_END].join('\n');
  const sp = join(CODEX_HOME, 'skills', 'laconia', 'SKILL.md');
  const skill = `---\nname: laconia\ndescription: Inspect or tune Laconia voice rules, audit its ledger, or lint a draft.\n---\n\n<!-- laconia:managed-skill -->\nRead [the console skill](<${join(base, 'skills/laconia/SKILL.md').replace(/\\/g, '/')}>) for this task.\n`;

  if (mode === 'check') {
    if (!has) skip('voice contract missing from AGENTS.md');
    else if (text.includes(block)) ok('AGENTS.md voice matches current source and personal preferences');
    else warn('AGENTS.md voice is stale; rerun install --agent codex');
    existsSync(sp) ? ok('console skill present') : skip('console skill missing');
    return;
  }

  const next = has
    ? text.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`), mode === 'uninstall' ? '' : block)
    : mode === 'uninstall' ? text
      : (text ? `${text}\n\n${block}\n` : `${block}\n`);

  backup(ap);
  writeAtomic(ap, next);
  wrote(`${ap}${mode === 'uninstall' ? ' (contract removed)' : ' (voice contract)'}`);
  if (mode === 'uninstall') {
    if (existsSync(sp) && readFileSync(sp, 'utf8').includes('<!-- laconia:managed-skill -->')) {
      backup(sp);
      rmSync(sp);
    }
  } else if (!existsSync(sp) || readFileSync(sp, 'utf8').includes('<!-- laconia:managed-skill -->')) {
    backup(sp);
    writeAtomic(sp, skill);
  } else warn(`preserved unowned skill at ${sp}`);
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

export function run({ mode = 'install', quiet = false, agent = 'both' } = {}) {
  QUIET = quiet;
  log(mode === 'uninstall' ? 'Laconia uninstall' : mode === 'check' ? 'Laconia status' : 'Laconia install');
  log(`  source  ${PKG_ROOT}`);

  if (!['both', 'claude', 'codex'].includes(agent)) throw new Error('agent must be claude, codex or both');
  if (mode === 'install') for (const target of [
    ...(agent !== 'codex' ? [CLAUDE_TARGET] : []),
    ...(agent !== 'claude' ? [join(LACONIA_HOME, 'runtime')] : []),
  ]) {
    const rel = relative(PKG_ROOT, target);
    if (rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)) throw new Error('Install target is inside package source; refusing recursive copy');
  }
  // Validate shared files before any writes, not halfway through an install.
  for (const path of [
    ...(agent !== 'codex' ? [join(CLAUDE_HOME, 'settings.json')] : []),
    ...(agent !== 'claude' ? [join(CODEX_HOME, 'hooks.json')] : []),
  ]) if (existsSync(path)) {
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error(`Invalid object at ${path}; left untouched`);
    if (doc.hooks && (typeof doc.hooks !== 'object' || Array.isArray(doc.hooks))) throw new Error(`Invalid hooks at ${path}; left untouched`);
    if (doc.hooks?.Stop && (!Array.isArray(doc.hooks.Stop) || doc.hooks.Stop.some((g) => !g || !Array.isArray(g.hooks)))) throw new Error(`Invalid Stop groups at ${path}; left untouched`);
    if (doc.hooks?.Stop?.some((g) => g.hooks.some((h) => !h || typeof h !== 'object' || Array.isArray(h)))) throw new Error(`Invalid Stop handler at ${path}; left untouched`);
    if (doc.enabledPlugins && (typeof doc.enabledPlugins !== 'object' || Array.isArray(doc.enabledPlugins))) throw new Error(`Invalid enabledPlugins at ${path}; left untouched`);
  }
  const ap = join(CODEX_HOME, 'AGENTS.md');
  if (agent !== 'claude' && existsSync(ap)) {
    const value = readFileSync(ap, 'utf8');
    const starts = value.split(MARK_START).length - 1, ends = value.split(MARK_END).length - 1;
    if (starts !== ends || starts > 1 || (starts && value.indexOf(MARK_END) < value.indexOf(MARK_START))) throw new Error('Malformed Laconia markers; AGENTS.md left untouched');
  }
  if (agent !== 'codex') claudeCode(mode);
  if (agent !== 'claude') codex(mode);
  userHome(mode);
  const { errors } = configStatus();
  for (const error of errors) warn(`${error}; runtime uses advisory fallback`);
  if (mode === 'check') {
    const rows = readLedger({}) || [];
    for (const name of (agent === 'both' ? ['claude', 'codex'] : [agent])) {
      const row = rows.filter((r) => r.agent === name).at(-1);
      if (row) note(`${name}: last recorded Stop ${row.ts}, version ${row.version || 'unknown'}. This is historical evidence, not current-session trust.`);
      else note(`${name}: no recorded Stop execution; activation unknown`);
    }
  }

  if (mode === 'install') {
    log('\nRestart any running sessions. Hooks and system prompts load at session start.');
    log('Use check to inspect wiring. Transcript audit is optional.');
  }
  log('');
  return errors.length ? 1 : 0;
}
