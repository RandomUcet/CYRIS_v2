import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnoseRun, formatAnnotations, inspectReleaseAssets, REQUIRED_RELEASE_ASSETS } from './release-doctor.mjs';

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

test('GitHub Actions pre-run annotations are shown even when the job has no logs', () => {
  const annotations = formatAnnotations([
    { annotation_level: 'failure', title: 'Job not started', message: 'GitHub reported a pre-run error', path: '.github/workflows/ci.yml' },
  ]);
  assert.equal(annotations.length,1);
  assert.equal(annotations[0].level,'failure');
  assert.equal(annotations[0].title,'Job not started');
  assert.match(annotations[0].message,/pre-run error/);
  assert.deepEqual(formatAnnotations(null),[]);
});

test('release doctor caps external annotation lengths before printing', () => {
  const huge = Array.from({length:12}, () => ({
    annotation_level:'failure',title:'t'.repeat(500), message:'m'.repeat(5000), path:'ci.yml'
  }));
  const formatted = formatAnnotations(huge);
  assert.equal(formatted.length,10);
  assert.equal(formatted[0].title.length,200);
  assert.equal(formatted[0].message.length,2000);
});
