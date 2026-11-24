import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('all three image dependency fetches precede versioned manifests',()=>{
 for(const name of ['api','worker','web']){
  const src=readFileSync(new URL('../docker/'+name+'.Dockerfile',import.meta.url),'utf8');
  const lock=src.indexOf('COPY pnpm-lock.yaml pnpm-workspace.yaml ./'), fetch=src.indexOf('RUN pnpm fetch --frozen-lockfile'), manifest=src.indexOf('COPY package.json ./');
  assert.ok(lock>=0 && fetch>lock && manifest>fetch);
  assert.match(src,/RUN pnpm install --frozen-lockfile/);
  assert.match(src,/USER (?:cyris|nextjs)/);
 }
});
