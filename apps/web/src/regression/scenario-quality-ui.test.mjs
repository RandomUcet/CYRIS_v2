import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Scenario preflight is visible next to draft images before publication', () => {
  const page = readFileSync(new URL('../app/events/[eventId]/scenario-data/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('<ScenarioDraftMediaManager'));
  assert.ok(page.includes('getScenarioDraftQuality(eventId, draft.id)'));
  assert.ok(page.includes("quality.ready"));
  assert.ok(page.includes('The score is advisory'));
  assert.ok(page.includes('Run preflight'));
});
