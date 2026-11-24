import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Court forms select people, cases, exhibits and filings by friendly search, not raw UUID typing', () => {
  const root = readFileSync(new URL('../app/events/[eventId]/court/page.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../app/events/[eventId]/court/[courtCaseId]/page.tsx', import.meta.url), 'utf8');
  for (const type of ['case', 'person', 'evidence', 'document']) {
    assert.ok((root + detail).includes('types="' + type + '"'), 'Missing ' + type + ' picker');
  }
  for (const placeholder of ['UUID of Person resource', 'UUID of operational Investigation Case',
    'Canonical evidence resource ID', 'UUID of Document in CYRIS']) {
    assert.ok(!(root + detail).includes(placeholder), 'Raw UUID form still shown: ' + placeholder);
  }
});

test('person selector uses the event-isolated canonical registry query rather than only Typesense', () => {
  const source = readFileSync(new URL('../components/common/ResourcePicker.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("types === 'person'"));
  assert.ok(source.includes('searchRegistryRecords(eventId, query.trim(), controller.signal)'));
  assert.ok(source.includes("item.entityType === 'persons'"));
  assert.ok(source.includes('getPerson(eventId, value, controller.signal)'));
});
