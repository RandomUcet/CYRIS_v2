import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Spark drafts allow images before publication and retain published image controls', () => {
  const page = readFileSync(new URL('../app/events/[eventId]/scenario-data/page.tsx', import.meta.url), 'utf8');
  const manager = readFileSync(new URL('../app/events/[eventId]/scenario-data/ScenarioDraftMediaManager.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('<ScenarioDraftMediaManager'));
  assert.ok(page.includes('<ScenarioBatchMediaManager'));
  assert.ok(manager.includes('uploadScenarioDraftMedia('));
  assert.ok(manager.includes('getScenarioDraftMedia('));
  assert.ok(manager.includes('removeScenarioDraftMedia('));
  assert.ok(manager.includes('getScenarioDraftImageUrl('));
  assert.ok(manager.includes('5 * 1024 * 1024'));
  assert.ok(page.includes('Attach images directly to records inside the draft'));
});
