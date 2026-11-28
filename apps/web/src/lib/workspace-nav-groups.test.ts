import test from 'node:test';
import assert from 'node:assert/strict';
import {organizeWorkspaceNavigation} from './workspace-nav-groups.js';
const root='/events/e';
const item=(path:string)=>({id:path,label:path,href:root+'/'+path});
test('stable navigation groups preserve every authorized destination, remove duplicates and add no links',()=>{
 const source=[{id:'one',title:'Old',items:[item('medical?view=triage'),item('forensics'),item('my-work'),item('court/filings')]},{id:'two',title:'Other',items:[item('forensics'),item('lab'),item('custom'),item('overview')]}];
 const out=organizeWorkspaceNavigation(source,root,false);
 assert.equal(out[0]?.id,'organized-work');
 assert.deepEqual(out[0]?.items.map(x=>x.href),[root+'/my-work',root+'/overview']);
 assert.deepEqual(new Set(out.flatMap(g=>g.items.map(x=>x.href))),new Set(source.flatMap(g=>g.items.map(x=>x.href))));
 assert.equal(out.flatMap(g=>g.items).length,7);
 assert.ok(out.some(g=>g.id==='other-two'&&g.items[0]?.href===root+'/custom'));
});
test('admin grouping keeps users and roles together without duplicate settings',()=>{
 const source=[{id:'admin',title:'Admin',items:['/admin/settings/identity','/admin/users','/admin/roles','/admin/events','/admin/settings/identity'].map(href=>({href,id:href,label:href}))}];
 const out=organizeWorkspaceNavigation(source,'/admin',true);
 assert.deepEqual(out.map(g=>g.id),['organized-admin-work','organized-admin-access']);
 assert.equal(out.flatMap(g=>g.items).length,4);
});
