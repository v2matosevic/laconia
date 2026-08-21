/**
 * Config loading. Shipped defaults, overlaid with the user's ~/.laconia/config.json.
 *
 * Read on every hook invocation, so it stays cheap and never throws: a broken
 * user config falls back to defaults rather than breaking every turn.
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { CONFIG_PATH, DEFAULT_CONFIG_PATH, ensureHome } from './paths.mjs';

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Shallow merge, one level into nested objects. Enough for this shape. */
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = { ...base[k], ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function defaults() {
  return readJson(DEFAULT_CONFIG_PATH) || {};
}

export function loadConfig() {
  const base = defaults();
  const user = existsSync(CONFIG_PATH) ? readJson(CONFIG_PATH) : null;
  return user ? merge(base, user) : base;
}

/** Seed ~/.laconia/config.json on first install. Never clobbers an existing one. */
export function seedConfig() {
  if (existsSync(CONFIG_PATH)) return false;
  if (!ensureHome()) return false;
  const seed = {
    $comment: 'Your Laconia settings. Anything omitted falls back to the shipped defaults. Re-read every turn, so no restart is needed.',
    mode: 'block',
  };
  const tmp = `${CONFIG_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(seed, null, 2) + '\n', 'utf8');
  renameSync(tmp, CONFIG_PATH);
  return true;
}
