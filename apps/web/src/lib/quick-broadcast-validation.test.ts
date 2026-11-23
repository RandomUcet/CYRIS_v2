import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { containsUnfilledBroadcastTemplate } from './quick-broadcast-validation.js';
import { quickBroadcastTemplates } from './quick-broadcast-templates.js';
import { ExerciseBroadcastRequestSchema } from '@cyris/contracts';

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
  const templates=quickBroadcastTemplates('cs');
  for(const key of ['briefing','sitrep','change','urgent']) {
    assert.ok(templates.some(template=>template.key===key),key);
  }
  assert.ok(code.includes('templates.slice(0,4)'));
  assert.ok(code.includes('templates.slice(4)'));
  assert.ok(code.includes('More operational templates'));
  assert.ok(code.includes('onClick={()=>applyTemplate(template)}'));
  assert.ok(code.includes('window.confirm(tr('));
  assert.ok(code.includes("step!=='REVIEW'"));
  assert.ok(code.includes('const latest=await apiClient.previewExerciseBroadcastAudience(eventId,'));
  assert.ok(code.includes('if(latest.data.eligible!==eligible)'));
  assert.ok(code.includes('setPreview({key:scopeKey,eligible:latest.data.eligible})'));
  assert.ok(code.includes("sendNonce.current??=crypto.randomUUID()"));
  assert.ok(code.includes("kindLabels[kind]"),'confirm screen must use readable message kinds');
});

test('EXCON templates are bilingual, unique, bounded and always require human completion', () => {
  const expected=['briefing','sitrep','change','urgent','phase','inject','checkin','outage','recovery','debrief'];
  for(const locale of ['cs','en'] as const){
    const templates=quickBroadcastTemplates(locale);
    assert.deepEqual(templates.map(t=>t.key),expected);
    assert.equal(new Set(templates.map(t=>t.key)).size,templates.length);
    for(const t of templates){
      assert.ok(t.name.trim()&&t.title.trim(),t.key);
      assert.ok(containsUnfilledBroadcastTemplate(t.title+' '+t.message),t.key);
      assert.ok(t.title.length<=120&&t.message.length<=900,t.key);
      assert.ok(ExerciseBroadcastRequestSchema.safeParse({
        nonce:'00000000-0000-4000-8000-000000000015',
        kind:t.kind,title:t.title,message:t.message,audience:'ALL',
      }).success,t.key);
    }
  }
});
