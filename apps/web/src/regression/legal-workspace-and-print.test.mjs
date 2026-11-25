import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('Court matter integrates requests and an authenticated print view',()=>{
  const s=readFileSync(new URL('../app/events/[eventId]/court/[courtCaseId]/page.tsx',import.meta.url),'utf8');
  assert.ok(s.includes('<CourtRequestsPanel'));
  assert.ok(s.includes("'requests'"));
  assert.ok(s.includes('/print'));
  const print=readFileSync(new URL('../app/events/[eventId]/court/[courtCaseId]/print/page.tsx',import.meta.url),'utf8');
  assert.ok(print.includes('getCourtCase(eventId,id)'));
  assert.ok(print.includes('listCourtRequests(eventId,id)'));
  assert.ok(print.includes('<PrintSheet'));
});
test('medical print view retrieves existing patient record only with authenticated API',()=>{
  const p=readFileSync(new URL('../app/events/[eventId]/medical/[encounterId]/print/page.tsx',import.meta.url),'utf8');
  assert.ok(p.includes('getMedicalEncounter(eventId,id)'));
  assert.ok(p.includes('observations.map'));
  assert.ok(p.includes('interventions.map'));
});
test('admin report and data administration are separate; cleanup is explicitly host-only',()=>{
  const report=readFileSync(new URL('../app/admin/events/[eventId]/report/page.tsx',import.meta.url),'utf8');
  const data=readFileSync(new URL('../app/admin/events/[eventId]/data/page.tsx',import.meta.url),'utf8');
  assert.ok(report.includes('getEventAfterActionReport(id)'));
  assert.ok(report.includes("'/admin/events/'+id+'/data'"));
  assert.ok(!report.includes('getEventPurgePreview'));
  assert.ok(data.includes('getEventPurgePreview'));
  assert.ok(data.includes('requestSequence'));
  assert.ok(data.includes('sudo cyrisctl cleanup'));
  assert.ok(data.includes('HOST_ONLY'));
  assert.ok(data.includes("mode==='selected'"));
  assert.ok(!data.includes('apiClient.delete'));
});
