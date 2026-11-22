import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('Spark generation is directly discoverable and does not imply draft image uploads already work', () => {
  const page = readFileSync(new URL('../app/events/[eventId]/scenario-data/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes("setMode('SPARK')"));
  assert.ok(page.includes("aria-pressed={mode==='SPARK'}"));
  assert.ok(page.includes('DGX Spark · AI'));
  assert.ok(page.includes('draft image attachments are still in development'));
  assert.ok(page.includes('<ScenarioBatchMediaManager'));
});
