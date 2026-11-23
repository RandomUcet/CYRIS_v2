import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { containsUnfilledBroadcastTemplate } from './quick-broadcast-validation.js';

test('EXCON rejects unsent placeholder fields in Czech and English',()=>{
  for(const text of ['[DOPLŇTE]','Potvrďte do [DOPLŇTE ČAS].','Deadline: [FILL IN TIME]','[fill in]']){
    assert.equal(containsUnfilledBroadcastTemplate(text),true,text);
  }
  for(const text of ['Briefing tomorrow at 09:30','[PROBĚHLO]','SITREP [confirmed]']){
    assert.equal(containsUnfilledBroadcastTemplate(text),false,text);
  }
});

test('global EXCON drawer is body-portalled, guards incomplete messages and exposes practical templates',()=>{
  const code=readFileSync(new URL('../components/layout/QuickBroadcastDrawer.tsx',import.meta.url),'utf8');
  assert.ok(code.includes('createPortal(<div'));
  assert.ok(code.includes('</div>, document.body)'));
  assert.ok(code.includes('const hasPlaceholders=containsUnfilledBroadcastTemplate('));
  assert.ok(code.includes('ready.canSendNow&&!hasPlaceholders'));
  assert.ok(code.includes('const canSaveDraft=Boolean(event)&&ready.canSave'));
  for(const template of ['briefing','sitrep','change','urgent']){
    assert.ok(code.includes("key:'"+template+"'"),template);
  }
  assert.ok(code.includes('onClick={()=>applyTemplate(template)}'));
  assert.ok(code.includes('window.confirm(tr('));
  assert.ok(code.includes("step!=='REVIEW'"));
});
