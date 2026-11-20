import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.next'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discover(path);
    return /\.test\.(ts|mjs)$/.test(entry.name) ? [path] : [];
  });
}
const tests = ['apps/api/src', 'apps/web/src', 'packages', 'scripts'].flatMap(discover)
  .filter((path) => !/(?:^|\/)(?:node_modules|dist)(?:\/|$)/.test(path)).sort();
if (!tests.length) throw new Error('No test files found.');
// Database suites use independent fixture IDs, but preservation assertions also
// compare global counts. Keep suites sequential within the disposable database.
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...tests], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test', TSX_TSCONFIG_PATH: join(process.cwd(), 'tsconfig.tests.json') },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
