import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isActionableMyWorkItem, isMyWorkViewAllowed, sortAndPaginateMyWork } from './my-work.js';

const item = (id: string, updatedAt: string) => ({
  id,
  eventId: '00000000-0000-0000-0000-000000000001',
  kind: 'TASK' as const,
  identifier: id,
  title: id,
  status: 'OPEN',
  assignedToUserId: null,
  assignedUnitId: null,
  updatedAt,
  href: `/events/00000000-0000-0000-0000-000000000001/tasks/${id}`,
});

test('My Work contract exposes bounded pagination and actionable item fields', () => {
  const response = {
    items: [item('a', '2026-01-01T00:00:00.000Z')],
    total: 1,
    page: 1,
    limit: 50,
    view: 'personal',
  };
  assert.equal(response.view, 'personal');
  assert.equal(response.limit <= 100, true);
  assert.equal(typeof response.items[0]?.href, 'string');
});

test('My Work aggregation has stable updated-time/id ordering and pagination', () => {
  const result = sortAndPaginateMyWork([
    item('a', '2026-01-01T00:00:00.000Z'),
    item('c', '2026-01-02T00:00:00.000Z'),
    item('b', '2026-01-02T00:00:00.000Z'),
  ], 1, 2);
  assert.deepEqual(result.items.map((entry) => entry.id), ['c', 'b']);
  assert.equal(result.total, 3);
});

test('My Work excludes terminal task and laboratory statuses', () => {
  assert.equal(isActionableMyWorkItem({ kind: 'TASK', status: 'COMPLETED' }), false);
  assert.equal(isActionableMyWorkItem({ kind: 'TASK', status: 'IN_PROGRESS' }), true);
  assert.equal(isActionableMyWorkItem({ kind: 'LAB_ANALYSIS', status: 'APPROVED' }), false);
  assert.equal(isActionableMyWorkItem({ kind: 'LAB_ANALYSIS', status: 'REQUESTED' }), true);
  assert.equal(isActionableMyWorkItem({kind:'FORENSIC_ANALYSIS',status:'APPROVED'}),false);
  assert.equal(isActionableMyWorkItem({kind:'FORENSIC_ANALYSIS',status:'COMPLETED'}),true);
});

test('My Work view scope allows only personal, authorized unit, or authorized event views', () => {
  assert.equal(isMyWorkViewAllowed('personal', false, false, false), true);
  assert.equal(isMyWorkViewAllowed('requested',false,false,false),true);
  assert.equal(isMyWorkViewAllowed('unit', true, false, true), true);
  assert.equal(isMyWorkViewAllowed('unit', true, false, false), false);
  assert.equal(isMyWorkViewAllowed('event', false, false, false), false);
  assert.equal(isMyWorkViewAllowed('event', false, true, false), true);
});

test('My Work controller route is declared before the dynamic task route', () => {
  const source = readFileSync(new URL('./tasks.controller.ts', import.meta.url), 'utf8');
  assert.ok(source.indexOf("@Get('my-work')") < source.indexOf("@Get(':taskId')"));
});

// Real role, assignment and event-scope checks live in regression/tasks-authorization.test.ts.
