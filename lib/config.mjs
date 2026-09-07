/**
 * Config loading. Shipped defaults, overlaid with the user's ~/.laconia/config.json.
 *
 * Read on every hook invocation, so it stays cheap and never throws: a broken
 * user config falls back to defaults rather than breaking every turn.
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { CONFIG_PATH, DEFAULT_CONFIG_PATH, PKG_ROOT, ensureHome } from './paths.mjs';
import { join } from 'node:path';
import { DEFAULTS } from './lint.mjs';

export function effectiveConfigJson(value) {
  const canonical = (v) => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter((k) => !k.startsWith('$')).sort().map((k) => [k, canonical(v[k])])) : v;
  return JSON.stringify(canonical(value));
}

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
  return readJson(DEFAULT_CONFIG_PATH) || { mode: 'advisory', lint: DEFAULTS };
}

// Small validator for our checked-in schema, not a general JSON Schema engine.
// Runtime and `check` deliberately use the same schema and validation decisions.
export function validateConfig(value) {
  const schema = JSON.parse(readFileSync(join(PKG_ROOT, 'config.schema.json'), 'utf8'));
  const errors = [];
  function visit(v, s, path) {
    if (s.enum && !s.enum.includes(v)) { errors.push(`${path}: unsupported value`); return; }
    if (s.type === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push(`${path}: expected object`); return; }
      for (const [key, child] of Object.entries(v)) {
        if (key.startsWith('$')) continue;
        if (!Object.hasOwn(s.properties, key)) errors.push(`${path}.${key}: unknown setting`);
        else visit(child, s.properties[key], `${path}.${key}`);
      }
    } else if (s.type === 'array') {
      if (!Array.isArray(v)) { errors.push(`${path}: expected array`); return; }
      if (s.uniqueItems && new Set(v).size !== v.length) errors.push(`${path}: duplicate items`);
      for (const child of v) visit(child, s.items, path);
    } else if (s.type === 'boolean' && typeof v !== 'boolean') errors.push(`${path}: expected boolean`);
    else if (s.type === 'number' || s.type === 'integer') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < s.minimum || (s.type === 'integer' && !Number.isInteger(v))) errors.push(`${path}: expected nonnegative ${s.type}`);
    }
  }
  visit(value, schema, 'config');
  return errors;
}

export function configStatus() {
  const base = defaults();
  const user = existsSync(CONFIG_PATH) ? readJson(CONFIG_PATH) : null;
  const errors = existsSync(CONFIG_PATH) && !user ? ['config: invalid JSON or null'] : [];
  try { errors.push(...validateConfig(base), ...(user ? validateConfig(user) : [])); }
  catch { errors.push('config: schema unavailable'); }
  if (errors.length) return { config: { ...base, mode: 'advisory', lint: { ...DEFAULTS }, browserFirst: { enabled: false } }, errors };
  return { config: user ? merge(base, user) : base, errors };
}

export function loadConfig() {
  return configStatus().config;
}

/** Seed ~/.laconia/config.json on first install. Never clobbers an existing one. */
export function seedConfig() {
  if (existsSync(CONFIG_PATH)) return false;
  if (!ensureHome()) return false;
  const seed = {
    $comment: 'Your Laconia settings. Anything omitted falls back to the shipped defaults. Re-read every turn, so no restart is needed.',
    mode: 'advisory',
  };
  const tmp = `${CONFIG_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(seed, null, 2) + '\n', 'utf8');
  renameSync(tmp, CONFIG_PATH);
  return true;
}
