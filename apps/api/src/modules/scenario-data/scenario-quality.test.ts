import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { localWorld } from './world.js';
import { inspectScenarioDraft } from './scenario-quality.js';

const counts = { persons: 2, organisations: 0, locations: 1, vehicles: 0, devices: 0, weapons: 0 };
const eventId = '9da678d4-bd4b-4de2-8bfb-af4721dc9e36';
const batchId = '9da678d4-bd4b-4de2-8bfb-af4721dc9e37';

describe('Scenario prepublication quality preflight', () => {
  it('reports complete coherent datasets without claiming factual verification', () => {
    const rows = localWorld(42, counts, new Set());
    const report = inspectScenarioDraft({ eventId, batchId, expected: counts, rows, images: 2, links: [
      { source: 'persons', index: 0, target: 'locations', targetIndex: 0 },
    ] });
    assert.equal(report.ready, true);
    assert.equal(report.expectedRecords, 3);
    assert.equal(report.preparedRecords, 3);
    assert.equal(report.images, 2);
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.equal(report.checks.find(x => x.code === 'RELATIONSHIPS')?.status, 'PASS');
  });
  it('flags duplicate names and invalid cross-record references', () => {
    const rows = localWorld(42, counts, new Set());
    rows.persons[1] = { ...rows.persons[0]! };
    const report = inspectScenarioDraft({ eventId, batchId, expected: counts, rows, images: 0, links: [
      { source: 'persons', index: 42, target: 'locations', targetIndex: 0 },
    ] });
    assert.equal(report.ready, false);
    assert.equal(report.checks.find(x => x.code === 'DUPLICATE_PEOPLE')?.status, 'FAIL');
    assert.equal(report.checks.find(x => x.code === 'RELATIONSHIPS')?.status, 'FAIL');
  });
  it('flags incomplete drafts', () => {
    const rows = localWorld(42, { ...counts, persons: 1 }, new Set());
    const report = inspectScenarioDraft({ eventId, batchId, expected: counts, rows, images: 0, links: [] });
    assert.equal(report.ready, false);
    assert.equal(report.preparedRecords, 2);
  });
});
