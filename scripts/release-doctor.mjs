#!/usr/bin/env node
/**
 * Non-destructive GitHub Actions / CYRIS Release doctor.
 *
 * Requires GitHub CLI authenticated with read access to the private repo:
 *   gh auth login
 *   node scripts/release-doctor.mjs --run 45232999107
 *
 * Never prints credentials or changes GitHub, packages or server state.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const REQUIRED_RELEASE_ASSETS = Object.freeze([
  'release-manifest.json', 'cyris-ubuntu.tar.gz', 'cyrisctl',
  'install.sh', 'compose.prod.yml',
]);

export function diagnoseRun(run, jobs) {
  if (run?.status !== 'completed') return {
    code: 'PENDING',
    message: 'The workflow has not completed. No release result can be inferred yet.',
  };
  const list = Array.isArray(jobs) ? jobs : [];
  if (run.conclusion === 'success' && list.length && list.every(job =>
    job.conclusion === 'success' && Array.isArray(job.steps) && job.steps.length > 0
  )) return {
    code: 'PASSED',
    message: 'All reported jobs succeeded after executing steps.',
  };
  const blocked = list.filter(job =>
    job.conclusion === 'failure' &&
    !job.runner_name && (!Array.isArray(job.steps) || job.steps.length === 0)
  );
  if (blocked.length > 0) return {
    code: 'RUNNER_NOT_ALLOCATED',
    message: 'GitHub failed one or more jobs before allocating a runner or executing a single step. ' +
      'This is not evidence of an application build failure. Inspect the job annotation and repository/org Actions ' +
      'settings. Check billing/budget only if the GitHub message indicates it. Never bypass CI checks.',
  };
  if (list.some(job => job.conclusion === 'failure' && Array.isArray(job.steps) && job.steps.length)) return {
    code: 'JOB_FAILED',
    message: 'At least one job started and executed steps, then failed. Read the failed step logs.',
  };
  return {
    code: 'UNVERIFIED',
    message: 'GitHub did not provide enough successful steps to prove a verified release gate.',
  };
}

export function inspectReleaseAssets(release) {
  const names = new Set((release?.assets ?? []).map(asset => asset.name));
  const missing = REQUIRED_RELEASE_ASSETS.filter(name => !names.has(name));
  return { complete: missing.length === 0, missing };
}

function githubApi(path) {
  return JSON.parse(execFileSync('gh', ['api', path], {
    encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

function options(argv) {
  let repo = 'RandomUcet/CYRIS_v2', runId = null;
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item === '--repo' && argv[i + 1]) repo = argv[++i];
    else if (item === '--run' && argv[i + 1]) runId = argv[++i];
    else if (item === '--help' || item === '-h') {
      process.stdout.write('Usage: node scripts/release-doctor.mjs [--repo owner/repo] [--run GitHubActionsRunId]\n');
      return null;
    } else throw new Error('Unknown or incomplete argument: ' + item);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Invalid GitHub repository name');
  if (runId !== null && !/^[1-9][0-9]*$/.test(runId)) throw new Error('Invalid GitHub Actions run ID');
  return { repo, runId };
}

async function main() {
  const opts = options(process.argv.slice(2));
  if (!opts) return;
  const { repo } = opts;
  const runId = opts.runId ?? githubApi('repos/' + repo + '/actions/runs?per_page=30')
    .workflow_runs.find(run => run.name === 'CI')?.id;
  if (!runId) throw new Error('Could not find a recent CI workflow run');
  const run = githubApi('repos/' + repo + '/actions/runs/' + runId);
  const jobs = githubApi('repos/' + repo + '/actions/runs/' + runId + '/jobs').jobs ?? [];
  const diagnosis = diagnoseRun(run, jobs);
  process.stdout.write('CYRIS RELEASE DOCTOR\n');
  process.stdout.write('GitHub run: https://github.com/' + repo + '/actions/runs/' + runId + '\n');
  process.stdout.write('Head SHA: ' + (run.head_sha ?? 'unknown') + '\n');
  process.stdout.write('Result: ' + diagnosis.code + '\n' + diagnosis.message + '\n');
  for (const job of jobs) {
    process.stdout.write('  ' + job.name + ': ' + job.conclusion + ', runner=' +
      (job.runner_name || 'not allocated') + ', steps=' + (job.steps?.length ?? 0) + '\n');
  }
  try {
    const release = githubApi('repos/' + repo + '/releases/latest');
    const assets = inspectReleaseAssets(release);
    process.stdout.write('Latest published GitHub Release: ' + release.tag_name + '\n');
    process.stdout.write('Release assets: ' + (assets.complete ? 'complete' : 'MISSING: ' + assets.missing.join(', ')) + '\n');
  } catch {
    process.stdout.write('Latest release: inaccessible (check permissions, do not assume it is absent).\n');
  }
  if (diagnosis.code !== 'PASSED') process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Unable to read GitHub Actions. Install gh and authenticate with repo read access (gh auth login).');
    process.exitCode = 3;
  });
}
