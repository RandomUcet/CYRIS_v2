import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const release=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
test('release builds use per-image GHA layer cache without relaxing dual-architecture digest pins',()=>{
  const images=['api','worker','web'];
  for(const name of images){
    const file='file: docker/'+name+'.Dockerfile';
    const start=release.indexOf(file);
    assert(start>0,'Missing '+file);
    const segment=release.slice(start,start+580);
    assert.match(segment,/platforms: linux\/amd64,linux\/arm64/);
    assert.match(segment,new RegExp('cache-from: type=gha,scope=cyris-'+name+'-stable'));
    assert.match(segment,new RegExp('cache-to: type=gha,mode=max,scope=cyris-'+name+'-stable,ignore-error=true'));
    assert.match(segment,/push: true/);
    assert.match(release,new RegExp('"'+name+'": f"ghcr.io\\/\\{owner\\}\\/cyris-'+name+'@'));
  }
  assert.match(release,/group: cyris-stable-release/);
  assert.match(release,/cancel-in-progress: false/);
  assert.match(release,/needs: validate/);
  assert.match(release,/Generate Release Manifest/);
  assert.match(release,/Package Ubuntu installer with matching image references/);
  assert.match(release,/fail_on_unmatched_files: true/);
  assert(!/cache-to:.*ghcr\.io/.test(release),'Avoid mutable registry cache tags in production');
});

test('CI and publisher support isolated runner recovery without bypassing verification',()=>{
  const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.ok(ci.includes("vars.CYRIS_CI_RUNNER || 'ubuntu-24.04'"));
  assert.match(ci,/playwright@1\.51\.1/);
  assert.match(ci,/playwright" install --with-deps chromium/);
  assert.match(ci,/node scripts\/browser-release-smoke\.mjs/);
  assert.match(ci,/upgrade-images:\s*\n[^]*?runs-on: ubuntu-24\.04/);
  const upgrade=ci.slice(ci.indexOf("  upgrade-images:"));
  assert.match(upgrade,/permissions:\s*\n\s*contents: read\s*\n\s*packages: read/);
  assert.match(upgrade,/uses: docker\/login-action@v3/);
  assert.ok(upgrade.includes("password: ${{ github.token }}"));
  assert.ok(upgrade.includes('DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}"'));
  assert.match(release,/permissions:\s*\n\s*contents: read\s*\n\s*packages: read/);
  assert.match(ci,/bash deploy\/tests\/upgrade-image-smoke\.sh "\$baseline"/);
  assert.ok(release.includes("vars.CYRIS_RELEASE_RUNNER || 'ubuntu-latest'"));
  assert.ok(ci.includes("run: sudo env GITHUB_ACTIONS=true"),'restore integration gate is mandatory');
  assert.ok(ci.includes("run: pnpm typecheck"));
  assert.ok(ci.includes("pnpm test:run"));
  assert.ok(release.includes("needs: validate"));
});

test('never publish a release with missing image digest or architecture',()=>{
  const check=release.indexOf('name: Verify every published image digest and both server architectures');
  const manifest=release.indexOf('name: Generate Release Manifest');
  const publish=release.indexOf('name: Create GitHub Release');
  assert.ok(check>0 && manifest>check && publish>manifest);
  assert.match(release,/docker buildx imagetools inspect/);
  assert.match(release,/required=\{\("linux", "amd64"\), \("linux", "arm64"\)\}/);
  for(const service of ['api','worker','web']) {
    assert.ok(release.includes('"'+service+':$'+service.toUpperCase()+'_DIGEST"'));
  }
});

test('next release rehearses the latest immutable published baseline and derives candidate identity',()=>{
  const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  const smoke=readFileSync(new URL('../deploy/tests/upgrade-image-smoke.sh',import.meta.url),'utf8');
  const db=readFileSync(new URL('../packages/db/src/retention-upgrade.test.ts',import.meta.url),'utf8');
  assert.ok(ci.includes('for baseline in 2.4.22 2.5.1 2.5.2; do'));
  assert.ok(ci.includes('createdb -U cyris_test -T template0 cyris_upgrade_252'));
  assert.ok(ci.includes('CYRIS_VERSION="$(cat VERSION)"'));
  assert.ok(smoke.includes('2.5.2) checksum=ed5b40126d3008a97e1de3a17f7d0dc90e3d027b20b6907e278ecc6f28c04eb9; count=43'));
  assert.ok(smoke.includes('candidate="$(cat VERSION)"'));
  assert.ok(smoke.includes('probe "$candidate"'));
  assert.ok(smoke.includes('== "$candidate_count"'));
  assert.ok(db.includes("version:'2.5.2',count:43,last:'0042_retained_exercise_audit'"));
});

test('upgrade smoke Python snippets separate path arguments from version argument',()=>{
  const smoke=readFileSync(new URL('../deploy/tests/upgrade-image-smoke.sh',import.meta.url),'utf8');
  assert.equal(smoke.split('env, manifest = map(pathlib.Path, sys.argv[1:3])').length-1,2);
  assert.ok(!smoke.includes('map(pathlib.Path, sys.argv[1:])'));
});

test('candidate cache keeps all three locally built runtime images and mandatory rehearsals',()=>{
 const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 const upgrade=ci.slice(ci.indexOf('  upgrade-images:'));
 assert.match(upgrade,/docker\/setup-buildx-action@v3/);
 for(const role of ['api','worker','web']){
  const start=upgrade.indexOf('file: docker/'+role+'.Dockerfile');
  assert.ok(start>0);
  const step=upgrade.slice(start,upgrade.indexOf('\n\n',start));
  assert.ok(step.includes('load: true'));
  assert.ok(step.includes('push: false'));
  assert.ok(step.includes('platforms: linux/amd64'));
  assert.ok(step.includes('tags: cyris-upgrade-candidate-'+role+':local'));
  assert.ok(step.includes('cache-from: type=gha,scope=cyris-ci-'+role));
  assert.ok(step.includes('cache-to: type=gha,mode=max,scope=cyris-ci-'+role+',ignore-error=true'));
 }
 assert.ok(upgrade.includes('docker image inspect "cyris-upgrade-candidate-$role:local"'));
 assert.ok(upgrade.includes('for baseline in 2.4.22 2.5.1 2.5.2; do'));
 assert.ok(!upgrade.includes('continue-on-error'));
});

test('upgrade evidence records checkout identity and per-baseline timings without swallowing failure',()=>{
 const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 const step=ci.slice(ci.indexOf('      - name: Rehearse published image upgrades'));
 assert.ok(step.includes('git rev-parse HEAD'));
 assert.ok(step.includes('docker image inspect --format'));
 assert.ok(step.includes('rehearsals.tsv'));
 assert.ok(step.includes('|| result=$?'));
 assert.ok(step.includes('if [[ "$result" != 0 ]]; then exit "$result"; fi'));
 assert.ok(step.includes('name: cyris-upgrade-rehearsal-evidence'));
 assert.ok(!step.includes('continue-on-error'));
 assert.ok(!step.includes('printenv'));
});
