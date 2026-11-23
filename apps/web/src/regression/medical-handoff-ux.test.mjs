import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

test('medical handoff dialog includes a real required destination and only medical team choices',()=>{
  const p=readFileSync(new URL('../app/events/[eventId]/medical/[encounterId]/page.tsx',import.meta.url),'utf8');
  assert.ok(p.includes('apiClient.getLocations(eventId)'));
  assert.ok(p.includes('apiClient.getUnits(eventId)'));
  assert.ok(p.includes("unit.capabilities?.includes('medical_operations')"));
  assert.ok(p.includes('id="transfer-destination-location" required'));
  assert.ok(p.includes('id="transfer-receiving-team"'));
  assert.ok(p.includes('receivingUnitId: transferForm.receivingUnitId || undefined'));
  assert.ok(p.includes('const disposition = [transferForm.disposition, notes].filter(Boolean).join'));
  assert.ok(p.includes('setActionPending(true)'));
  assert.ok(p.includes('transferLocations.length === 0'));
  assert.ok(p.includes('role="status"'));
});

test('intake asks for team selection only when multiple active medical teams exist',()=>{
  const page=readFileSync(new URL('../app/events/[eventId]/medical/page.tsx',import.meta.url),'utf8');
  assert.ok(page.includes('workspace?.unitIds'));
  assert.ok(page.includes("unit.capabilities?.includes('medical_operations')"));
  assert.ok(page.includes('medicalTeams.length > 1'));
  assert.ok(page.includes('id="new-medical-team" required'));
  assert.ok(page.includes('assignedUnitId: formData.assignedUnitId || undefined'));
});

test('handoff reuses the one existing registry locations method',()=>{
  const client=readFileSync(new URL('../lib/api-client.ts',import.meta.url),'utf8');
  assert.equal((client.match(/async getLocations\(/g)||[]).length,1);
});
