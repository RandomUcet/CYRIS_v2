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
const tests = ['apps/api/src', 'apps/web/src', 'apps/worker/src', 'packages', 'scripts'].flatMap(discover)
  .filter((path) => !/(?:^|\/)(?:node_modules|dist)(?:\/|$)/.test(path)).sort();
if (!tests.length) throw new Error('No test files found.');
// Database suites use independent fixture IDs, but preservation assertions also
// compare global counts. Keep suites sequential within the disposable database.
// An accidental nested-test deadlock must fail predictably rather than keep CI busy
// indefinitely. The job watchdog provides a separate limit for setup and restore.
const regressionTimeoutMs = 10 * 60 * 1000;
const startedAt = Date.now();
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...tests], {
  stdio: 'inherit',
  timeout: regressionTimeoutMs,
  killSignal: 'SIGTERM',
  env: { ...process.env, NODE_ENV: 'test', TSX_TSCONFIG_PATH: join(process.cwd(), 'tsconfig.tests.json') },
});
if (result.error?.code === 'ETIMEDOUT') {
  console.error(`[CYRIS tests] Regression suite exceeded ${regressionTimeoutMs / 60000} minutes across ${tests.length} discovered files. Check for an unresolved async operation or a nested node:test subtest awaiting its parent.`);
  process.exitCode = 124;
} else if (result.error) {
  throw result.error;
} else {
  if (result.signal) console.error(`[CYRIS tests] Runner terminated by signal ${result.signal}.`);
  if (result.status !== 0) console.error(`[CYRIS tests] Regression suite failed (exit=${result.status ?? 'unknown'}, duration=${Math.round((Date.now() - startedAt) / 1000)}s).`);
  process.exitCode = result.status ?? 1;
}
