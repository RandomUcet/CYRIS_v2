import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../app/events/[eventId]/medical/[encounterId]/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/api-client.ts', import.meta.url), 'utf8');

test('receiving teams see a single acknowledgement action instead of stabilization before receipt', () => {
  assert.match(source, /encounter\?\.status === 'TRANSFERRED'/);
  assert.match(source, /onClick=\{handleReceive\}/);
  assert.match(source, /apiClient\.receiveMedicalEncounter\(eventId, encounterId\)/);
  assert.match(source, /'RECEIVED', 'TRIAGED', 'UNDER_CARE'/);
  assert.match(source, /'TRANSFERRED', 'CLOSED', 'DECEASED'/);
  assert.match(source, /canIntervene &&/);
  assert.match(source, /setReceiveSuccess/);
  assert.match(source, /role="status"/);
  assert.match(source, /'medical\.transfer\.received'/);
  assert.match(source, /Historie předání a převzetí/);
});

test('client posts acknowledgement to the event-scoped medical endpoint', () => {
  assert.match(api, /async receiveMedicalEncounter\(/);
  assert.match(api, /\/medical\/\$\{encounterId\}\/receive/);
});
