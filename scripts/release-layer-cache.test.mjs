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
