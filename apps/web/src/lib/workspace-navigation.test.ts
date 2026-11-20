import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeWorkspaceHref,workspaceLabel} from './workspace-navigation';
const e='/events/demo';
test('only most-specific matching navigation entry',()=>{assert.equal(activeWorkspaceHref([e+'/forensics',e+'/forensics/indicators'],e+'/forensics/indicators',''),e+'/forensics/indicators');assert.equal(activeWorkspaceHref([e+'/evaluation',e+'/evaluation/after-action'],e+'/evaluation/after-action',''),e+'/evaluation/after-action');});
test('query-based medical views and path segment boundaries',()=>{const paths=[e+'/medical',e+'/medical?view=triage',e+'/medical?view=transfers'];assert.equal(activeWorkspaceHref(paths,e+'/medical','view=transfers'),paths[2]);assert.equal(activeWorkspaceHref(paths,e+'/medical',''),paths[0]);assert.equal(activeWorkspaceHref([e+'/cases'],e+'/cases-extra',''),undefined);});
test('static Czech labels preserve arbitrary labels',()=>{assert.equal(workspaceLabel('cs','Objectives'),'Cíle');assert.equal(workspaceLabel('en','Objectives'),'Objectives');assert.equal(workspaceLabel('cs','Unique event title'),'Unique event title');});
