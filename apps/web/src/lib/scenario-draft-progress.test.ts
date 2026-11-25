import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draftProgress, assertDraftAdvance, formatElapsed, plannedInferenceCalls } from './scenario-draft-progress.js';
test('progress reflects saved rows and stays bounded', () => {
  assert.deepEqual(draftProgress(12,108), {prepared:12,expected:108,percent:11});
  assert.deepEqual(draftProgress(108,108), {prepared:108,expected:108,percent:100});
  assert.deepEqual(draftProgress(200,108), {prepared:108,expected:108,percent:100});
  assert.deepEqual(draftProgress(NaN,0), {prepared:0,expected:0,percent:0});
  assert.equal(formatElapsed(125), '2:05');
});
test('draft advance rejects no progress, regressions, closed or mismatched drafts', () => {
  const current = {id:'a',eventId:'e',status:'DRAFT',prepared:12};
  assert.equal(assertDraftAdvance(current,{...current,prepared:24}),true);
  assert.equal(assertDraftAdvance(current,current),false);
  assert.equal(assertDraftAdvance(current,{...current,prepared:0}),false);
  assert.equal(assertDraftAdvance(current,{...current,id:'b',prepared:24}),false);
  assert.equal(assertDraftAdvance(current,{...current,eventId:'f',prepared:24}),false);
  assert.equal(assertDraftAdvance(current,{...current,status:'CLEANED',prepared:24}),false);
});
test('workspace isolates event state, protects generation and restores draft strategy', () => {
  const page = readFileSync(new URL('../app/events/[eventId]/scenario-data/page.tsx',import.meta.url),'utf8');
  assert.ok(page.includes('<ScenarioDataWorkspace key={eventId}'));
  assert.ok(page.includes('if (operation.current || !alive.current) return;'));
  assert.ok(page.includes('apiClient.queueScenarioDraft(eventId,current.id)'));
  assert.ok(page.includes('old?.id===id?next:old'));
  assert.ok(page.includes('setSparkStrategy(r.data.strategy ?? \'DETAILED\')'));
  assert.ok(page.includes('request !== historyRequest.current'));
  assert.ok(page.includes('apiClient.pauseScenarioDraft(eventId,draft.id)'));
});

test('inference plan counts actual category pages, not just total records', () => {
  assert.equal(plannedInferenceCalls([40,6,12,20,25,5],'DETAILED'),12);
  assert.equal(plannedInferenceCalls([40,6,12,20,25,5],'FAST'),1);
  assert.equal(plannedInferenceCalls([1,1,0],'DETAILED'),2);
  assert.equal(plannedInferenceCalls([0,0],'FAST'),0);
  assert.equal(plannedInferenceCalls([-1,12],'DETAILED'),0);
});
