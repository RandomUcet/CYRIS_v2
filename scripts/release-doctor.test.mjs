import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnoseRun, inspectReleaseAssets, REQUIRED_RELEASE_ASSETS } from './release-doctor.mjs';

const run = (conclusion = 'failure', status = 'completed') => ({ conclusion, status });
const job = (conclusion, runner_name = '', steps = []) => ({ name: 'validate', conclusion, runner_name, steps });

test('never misdiagnose runner allocation as application compilation failure', () => {
  const result = diagnoseRun(run(), [job('failure')]);
  assert.equal(result.code, 'RUNNER_NOT_ALLOCATED');
  assert.match(result.message, /before allocating a runner/);
  assert.match(result.message, /not evidence of an application build failure/);
});

test('report genuine step-level failure separately', () => {
  assert.equal(diagnoseRun(run(), [job('failure', 'ubuntu-runner', [{
    name: 'Typecheck', status: 'completed', conclusion: 'failure',
  }])]).code, 'JOB_FAILED');
});

test('success requires executed and successful jobs, not merely a green workflow label', () => {
  assert.equal(diagnoseRun(run('success'), [job('success', 'ubuntu-runner', [
    { name: 'Build', conclusion: 'success' },
  ])]).code, 'PASSED');
  assert.equal(diagnoseRun(run('success'), [job('success')]).code, 'UNVERIFIED');
});

test('do not infer success from queued, incomplete or step-free runs', () => {
  assert.equal(diagnoseRun(run(null, 'queued'), []).code, 'PENDING');
  assert.equal(diagnoseRun(run(), []).code, 'UNVERIFIED');
});

test('release assets must contain every Ubuntu package required by cyrisctl update', () => {
  const complete = inspectReleaseAssets({
    assets: REQUIRED_RELEASE_ASSETS.map(name => ({ name })),
  });
  assert.equal(complete.complete, true);
  const missing = inspectReleaseAssets({ assets: [{ name: 'release-manifest.json' }] });
  assert.equal(missing.complete, false);
  assert.ok(missing.missing.includes('cyris-ubuntu.tar.gz'));
  assert.ok(missing.missing.includes('cyrisctl'));
});
