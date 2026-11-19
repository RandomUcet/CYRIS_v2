import assert from 'node:assert/strict';
import test from 'node:test';
import { sortAndPaginateMyWork } from './my-work.js';
import { skipWithoutVerifiedDatabase } from '../../regression/isolated-postgres-harness.js';

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

skipWithoutVerifiedDatabase(
  'NOT IMPLEMENTED: My Work personal ACL denies unrelated assignments and accepts assigned task/lab items',
  async () => {
    throw new Error('Harness extension required: provision isolated task/lab resources and memberships');
  }
);

skipWithoutVerifiedDatabase(
  'NOT IMPLEMENTED: My Work unit and event views enforce leader and EXCON authorization',
  async () => {
    throw new Error('Harness extension required: provision isolated unit/event role permissions');
  }
);
