import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('all images use the supported frozen pnpm install and retain non-root runtime',()=>{
 for(const name of ['api','worker','web']){
  const src=readFileSync(new URL('../docker/'+name+'.Dockerfile',import.meta.url),'utf8');
  assert.doesNotMatch(src,/pnpm fetch --frozen-lockfile/);
  assert.match(src,/COPY pnpm-lock\.yaml pnpm-workspace\.yaml package\.json \.\//);
  assert.match(src,/RUN pnpm install --frozen-lockfile/);
  assert.match(src,/USER (?:cyris|nextjs)/);
 }
});
