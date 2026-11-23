import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Cheap regression for CI gate structure. The actual GitHub PR gate tests the
// workflow by executing it, not merely by parsing this text.
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const runner = readFileSync(new URL('./run-tests.mjs', import.meta.url), 'utf8');

test('PR CI checks only PR events, main push, reusable releases and explicit dispatch', () => {
  assert.match(workflow, /^on:\n(?:  #[^\n]*\n)*  push:\n    branches: \[main\]\n  pull_request:\n(?:  #[^\n]*\n)*  workflow_call:\n  workflow_dispatch:/m);
  assert.match(workflow, /group: cyris-ci-.*github\.workflow.*github\.event_name == 'pull_request'.*github\.run_id/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(workflow, /timeout-minutes: 25/);
});

test('Release validation still calls CI and publishing is never cancelled by PR concurrency', () => {
  assert.match(release, /  validate:\n    uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(release, /group: cyris-stable-release\n  cancel-in-progress: false/);
  assert.match(workflow, /github\.run_id/);
});

test('node:test remains sequential and has a bounded watchdog with failure diagnostics', () => {
  assert.match(runner, /'--test-concurrency=1'/);
  assert.match(runner, /const regressionTimeoutMs = 10 \* 60 \* 1000/);
  assert.match(runner, /timeout: regressionTimeoutMs/);
  assert.match(runner, /result\.error\?\.code === 'ETIMEDOUT'/);
  assert.match(runner, /process\.exitCode = 124/);
  assert.match(workflow, /name: Restore encrypted backup on an isolated Compose project/);
});
