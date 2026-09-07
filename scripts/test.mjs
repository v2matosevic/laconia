import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(join(root, 'test')).filter((p) => p.endsWith('.test.mjs')).map((p) => join(root, 'test', p));
process.exit(spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1);
