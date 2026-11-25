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

test('document detail uses consistent surface tokens and guards outdated responses',()=>{
 const doc=read('../app/events/[eventId]/documents/page.tsx');
 assert.doesNotMatch(doc,/background: '#(?:111827|0f172a)'/);
 assert.doesNotMatch(doc,/color: '#f3f4f6'/);
 assert.match(doc,/request!==detailRequest\.current/);
 assert.match(doc,/uploadLock\.current/);
});
test('legal inbox is top-aligned and EXCON white text is scoped to readable colors',()=>{
 const legal=read('../app/events/[eventId]/legal-requests/page.tsx');
 const css=read('../app/globals.css');
 assert.match(legal,/className="legal-inbox-workspace"/);
 assert.match(css,/\.legal-inbox-workspace\{[^}]*margin:0 auto/);
 assert.match(css,/\.workspace-content :is\(\.excon-optimized,\.broadcast-optimized\) \.text-white\{color:var\(--text-primary\)/);
});

test('EXCON attention precedes quick actions and scope changes cancel old requests',()=>{
 const source=read('../app/events/[eventId]/excon/page.tsx');
 assert.ok(source.includes('Vyžaduje pozornost'));
 assert.ok(source.indexOf('Vyžaduje pozornost')<source.lastIndexOf('className="excon-toolbar"'));
 assert.match(source,/\{!snapshot && <nav className="excon-toolbar"/);
 assert.match(source,/controllerRef\.current\?\.abort\(\)/);
 assert.match(source,/result\.data\?\.event\.id===eventId/);
});
