import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('EXCON and broadcast literal classes have scoped CSS coverage',()=>{
 const css=read('../app/excon-workspace.css')+read('../app/workspace-legacy.css');
 for(const path of ['../app/events/[eventId]/excon/page.tsx','../app/events/[eventId]/broadcast/page.tsx']){
   const source=read(path);assert.match(source,/className="(?:excon|broadcast)-optimized /);
   for(const token of new Set([...source.matchAll(/className="([^"]+)"/g)].flatMap(m=>m[1].split(/\s+/)))){
     if(['excon-optimized','broadcast-optimized'].includes(token))continue;
     assert.ok(css.includes('.'+token.replace(/[^a-zA-Z0-9_-]/g,'\\$&')),path+': missing '+token);
   }
 }
 assert.match(read('../app/globals.css'),/@import '\.\/excon-workspace\.css'/);
});
