import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeWorkspaceSections} from './workspace-permission-links.js';
const e='exercise',root='/events/'+e;
test('mixed role grants remain visible even under a dedicated team profile',()=>{
  const sections=completeWorkspaceSections([{id:'medical-section',title:'Medical',items:[{id:'medical',label:'Medical',href:root+'/medical'}]}],e,new Set(['member','medical','registry','court','documents']));
  const hrefs=sections.flatMap(s=>s.items.map(i=>i.href));
  for(const path of ['/medical','/registry','/relationships','/court','/documents','/overview'])assert.ok(hrefs.includes(root+path));
  assert.equal(new Set(hrefs).size,hrefs.length);
  assert.ok(!hrefs.includes(root+'/command'));
});
test('capability-only links without grants disappear; empty groups are removed',()=>{
  const sections=completeWorkspaceSections([{id:'command-section',title:'Command',items:[{id:'command',label:'Command',href:root+'/command'},{id:'timeline',label:'Timeline',href:root+'/timeline'}]}],e,new Set(['member']));
  assert.ok(!sections.some(s=>s.id==='command-section'));
  assert.deepEqual(sections.flatMap(s=>s.items.map(i=>i.href)),[root+'/overview']);
});
test('indicator and scenario data availability are independent of broader domain grants',()=>{
  const sections=completeWorkspaceSections([],e,new Set(['member','indicators','scenario']));
  const hrefs=sections.flatMap(s=>s.items.map(i=>i.href));
  assert.ok(hrefs.includes(root+'/forensics/indicators'));
  assert.ok(!hrefs.includes(root+'/forensics'));
  assert.ok(!hrefs.includes(root+'/scenario-data'));
});
