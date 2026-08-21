/**
 * Where everything lives.
 *
 * The package is stateless and replaceable: a marketplace install copies it into
 * a cache directory that is thrown away on every update. So nothing the user
 * owns may live inside it. All user state goes to ~/.laconia, which is also
 * tool-neutral, because Laconia drives Claude Code and Codex from one place.
 */

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

export const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const HOME = homedir();
export const LACONIA_HOME = process.env.LACONIA_HOME || join(HOME, '.laconia');

export const CONFIG_PATH = join(LACONIA_HOME, 'config.json');
export const LEDGER_PATH = join(LACONIA_HOME, 'ledger.jsonl');
export const STATE_PATH = join(LACONIA_HOME, 'state.json');
export const LOCAL_VOICE_PATH = join(LACONIA_HOME, 'voice.local.md');

export const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR || join(HOME, '.claude');
export const CLAUDE_SKILLS_DIR = join(CLAUDE_HOME, 'skills');
export const CLAUDE_PROJECTS_DIR = join(CLAUDE_HOME, 'projects');

export const CODEX_HOME = process.env.CODEX_HOME || join(HOME, '.codex');
export const CODEX_SESSIONS_DIR = join(CODEX_HOME, 'sessions');

export const DEFAULT_CONFIG_PATH = join(PKG_ROOT, 'laconia.config.json');
export const VOICE_PATH = join(PKG_ROOT, 'output-styles', 'laconia.md');

export function ensureHome() {
  try {
    mkdirSync(LACONIA_HOME, { recursive: true });
    return true;
  } catch {
    return false;
  }
}
