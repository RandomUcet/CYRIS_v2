import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('team commands preserve a working Node and recover from a broken macOS Node in a fresh shell', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'cyris-node-test-'));
  const prefix = join(fixture, 'node 22');
  const fallback = join(prefix, 'bin', 'node');
  const script = (path: string, body: string) => writeFileSync(path, '#!/bin/sh\n' + body, { mode: 0o755 });
  const launch = (probeStatus: number, args: string[]) => spawnSync('bash', ['scripts/preview-teams.sh', ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fixture}:${process.env.PATH}`, TEST_PREFIX: prefix, PROBE_STATUS: String(probeStatus) },
  });
  try {
    script(join(fixture, 'uname'), 'echo Darwin');
    script(join(fixture, 'brew'), '[ "$1" = --prefix ] && [ "$2" = node@22 ] && echo "$TEST_PREFIX"');
    script(join(fixture, 'node'), 'if [ "$1" = --version ]; then exit "$PROBE_STATUS"; fi\necho "selected $*"');
    mkdirSync(join(prefix, 'bin'), { recursive: true });
    script(fallback, 'if [ "$1" = --version ]; then exit 0; fi\necho "fallback $*"');

    const listArgs = '--import tsx scripts/preview-teams.ts --list';
    assert.equal(launch(0, ['--list']).stdout.trim(), 'selected ' + listArgs);
    assert.equal(launch(134, ['--list']).stdout.trim(), 'fallback ' + listArgs);
    assert.equal(launch(134, []).stdout.trim(), 'fallback --import tsx scripts/preview-teams.ts');

    script(fallback, 'exit 134');
    const broken = launch(134, ['--list']);
    assert.notEqual(broken.status, 0);
    assert.match(broken.stderr, /brew reinstall node@22/);
    rmSync(fallback);
    const missing = launch(134, ['--list']);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /brew install node@22/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('startup requires every expected container and successful bucket initialization', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'cyris-health-test-'));
  const helper = join(process.cwd(), 'scripts', 'dev-runtime.sh');
  writeFileSync(join(fixture, 'docker'), `#!/usr/bin/env bash
if [[ "$1" == 'compose' ]]; then
  service="\${@: -1}"
  [[ "$service" != "\${MISSING_SERVICE:-}" ]] && echo "$service"
elif [[ "$1" == 'inspect' ]]; then
  service="\${@: -1}"
  if [[ "$service" == 'minio-init' ]]; then
    printf 'exited none %s\\n' "\${INIT_EXIT:-0}"
  elif [[ "$service" == "\${UNHEALTHY_SERVICE:-}" ]]; then
    echo 'running unhealthy 0'
  else
    echo 'running healthy 0'
  fi
fi
`, { mode: 0o755 });
  const check = (variables: Record<string, string> = {}) => spawnSync('bash', ['-c', 'source "$1"; infrastructure_ready', 'test', helper], {
    env: { ...process.env, PATH: `${fixture}:${process.env.PATH}`, ...variables },
  }).status;
  try {
    assert.equal(check(), 0);
    for (const service of ['postgres', 'redis', 'typesense', 'minio', 'mailpit', 'minio-init']) {
      assert.notEqual(check({ MISSING_SERVICE: service }), 0, `${service} cannot be absent`);
    }
    assert.notEqual(check({ UNHEALTHY_SERVICE: 'postgres' }), 0);
    assert.notEqual(check({ INIT_EXIT: '1' }), 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
