import assert from 'node:assert/strict';
import test from 'node:test';
import { ScenarioRowSchemas } from '@cyris/contracts';
import { localWorld } from '../modules/scenario-data/world.js';
import { ScenarioBlueprintSchema, applyScenarioBlueprint, fastDraftLinks } from '../modules/scenario-data/scenario-fast-draft.js';
import { readFileSync } from 'node:fs';

const blueprint = ScenarioBlueprintSchema.parse({
  setting: 'Rail depot during a simulated service outage',
  roles: ['dispatcher', 'warehouse clerk', 'switching supervisor'],
  sites: ['loading platform', 'dispatch office', 'storage hall'],
  organisations: ['rail freight operator', 'local facilities contractor', 'dispatch coordination'],
  activities: ['reassigning delayed shipments', 'checking incoming goods', 'coordinating shift handover'],
  equipment: ['document dispatch', 'inventory scanning', 'staff transport'],
});
test('fast strategy builds an entire coherent 108-record synthetic draft with valid links', () => {
  const counts = { persons: 40, organisations: 6, locations: 12, vehicles: 20, devices: 25, weapons: 5 };
  const build = () => applyScenarioBlueprint(localWorld(2027, counts, new Set()), blueprint);
  const a = build(), b = build();
  assert.deepEqual(a, b);
  assert.equal(Object.values(a).reduce((n, rows) => n + rows.length, 0), 108);
  for (const [kind, schema] of Object.entries(ScenarioRowSchemas)) {
    for (const record of a[kind as keyof typeof a]) {
      assert.equal(schema.safeParse(record).success, true, kind);
      assert.match(record.description, /Rail depot/);
    }
  }
  const links = fastDraftLinks(a);
  assert(links.length > 0);
  for (const link of links) {
    assert(a[link.source][link.index] && a[link.target][link.targetIndex]);
  }
  assert.deepEqual(links, fastDraftLinks(b));
});
test('fast blueprint schema rejects oversized or incomplete model payloads', () => {
  assert.equal(ScenarioBlueprintSchema.safeParse({ setting: 'Only a setting' }).success, false);
  assert.equal(ScenarioBlueprintSchema.safeParse({ ...blueprint, setting: 'x'.repeat(121) }).success, false);
});
test('fast strategy is explicit in UI and the backend uses one bounded AI request', () => {
  const service = readFileSync(new URL('../modules/scenario-data/scenario-data.service.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../../web/src/app/events/[eventId]/scenario-data/page.tsx', import.meta.url), 'utf8');
  assert.match(service, /conf\.strategy === 'FAST'/);
  assert.match(service, /promptTemplateVersion: 'scenario-blueprint-fast-v1'/);
  assert.match(service, /maxTokens: 450, timeoutMs: 45_000/);
  assert.match(service, /prepared: total\(cleanCounts\(conf\)\)/);
  assert.match(page, /setSparkStrategy/);
  assert.match(page, /strategy: sparkStrategy/);
  assert.match(page, /value="DETAILED"/);
});
