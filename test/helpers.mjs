import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function fixture(t, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'laconia-test-'));
  // Every child gets private agent homes; no real user configuration is touched.
  const env = { ...process.env, LACONIA_HOME: join(dir, 'user'), CLAUDE_CONFIG_DIR: join(dir, 'claude'), CODEX_HOME: join(dir, 'codex') };
  for (const path of [env.LACONIA_HOME, env.CLAUDE_CONFIG_DIR, env.CODEX_HOME]) mkdirSync(path);
  writeFileSync(join(env.LACONIA_HOME, 'config.json'), JSON.stringify(config));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (file, args = [], input = '') => spawnSync(process.execPath, [join(root, file), ...args], { env, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 20000 });
  return { dir, env, run, cli: (...args) => run('bin/laconia.mjs', args), hook: (input) => run('scripts/stop-gate.mjs', ['--agent', 'codex'], input) };
}
