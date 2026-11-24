import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('roster rendering is bounded and inactive tabs cancel membership loads',()=>{
 const p=readFileSync(new URL('../app/admin/users/page.tsx',import.meta.url),'utf8');
 const t=readFileSync(new URL('../components/common/DataTable.tsx',import.meta.url),'utf8');
 assert.match(p,/pageSize=\{50\}/);assert.match(p,/tab!=='participants'/);assert.match(p,/controller\.abort\(\)/);
 assert.match(t,/sortedData\.slice\(\(page-1\)\*size,page\*size\)/);
 assert.match(t,/visible\.map\(/);
});

test('preview does not leave users management in perpetual loading',()=>{
 const p=readFileSync(new URL('../app/admin/users/page.tsx',import.meta.url),'utf8');
 assert.match(p,/if\(viewAs\)return <AppShell/);
});
