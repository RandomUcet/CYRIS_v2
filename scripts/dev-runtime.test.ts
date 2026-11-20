import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('startup requires every expected container and successful bucket initialization', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'cyris-health-test-'));
  const helper = fileURLToPath(new URL('./dev-runtime.sh', import.meta.url));
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
