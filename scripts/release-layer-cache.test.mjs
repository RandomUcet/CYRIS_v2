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
  assert.ok(release.includes("vars.CYRIS_RELEASE_RUNNER || 'ubuntu-24.04'"));
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
