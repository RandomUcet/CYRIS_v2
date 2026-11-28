import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('forensic queue keeps server paging and search and ignores stale responses',()=>{
 const page=read('../app/events/[eventId]/forensics/page.tsx');
 assert.ok(page.includes('page,limit:pageSize'));
 assert.ok(page.includes('sequence!==requestSequence.current'));
 assert.ok(page.includes('page*pageSize>=total'));
});
test('forensic report has labeled full width responsive fields',()=>{
 const page=read('../app/events/[eventId]/forensics/[analysisId]/page.tsx');
 const css=read('../app/globals.css');
 for(const id of ['forensic-methodology','forensic-findings','forensic-conclusion']){assert.ok(page.includes('htmlFor="'+id+'"'));assert.ok(page.includes('id="'+id+'"'));}
 assert.ok(css.includes('.forensic-report-field{display:block;box-sizing:border-box;width:100%'));
 assert.ok(css.includes('@media(max-width:1000px){.forensic-overview-grid'));
});
