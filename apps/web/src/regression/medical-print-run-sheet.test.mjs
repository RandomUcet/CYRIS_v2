import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

test('medical printable run sheet derives records from authorized medical list, never platform-wide totals', () => {
  const page=readFileSync(new URL('../app/events/[eventId]/medical/print/page.tsx',import.meta.url),'utf8');
  assert.ok(page.includes('apiClient.listMedicalEncounters(eventId)'));
  assert.ok(!page.includes('getMedicalSummary('));
  assert.ok(page.includes('filterMedicalRunSheet(items,'));
  assert.ok(page.includes('<PrintSheet'));
  const screen=readFileSync(new URL('../app/events/[eventId]/medical/page.tsx',import.meta.url),'utf8');
  assert.ok(screen.includes('filterMedicalRunSheet(encounters,'));
  assert.ok(screen.includes('medical/print?'));
});
