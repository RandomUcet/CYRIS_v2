import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceStatusResponseSchema } from '@cyris/contracts';
import { summarizeServiceStatus } from './service-status-policy.js';

test('personal status counts affected modules and returns only neutral fields', () => {
  const items = [{ service: 'tasks', impact: 'READ_ONLY' }, { service: 'lab', impact: 'UNAVAILABLE' }] as const;
  assert.deepEqual(summarizeServiceStatus([]), { impact: 'NONE', activeCount: 0 });
  assert.deepEqual(summarizeServiceStatus([items[0]]), { impact: 'READ_ONLY', activeCount: 1 });
  const current = summarizeServiceStatus([...items]);
  assert.deepEqual(current, { impact: 'UNAVAILABLE', activeCount: 2 });
  const response = {
    eventId: '00000000-0000-4000-8000-000000000001', generatedAt: new Date().toISOString(),
    scope: 'PERSONAL', current, items,
  };
  assert.deepEqual(ServiceStatusResponseSchema.parse({
    ...response,
    current: { ...current, plannedCount: 4 },
    items: items.map(item => ({ ...item, id: 'hidden', reason: 'private', revision: 5, targetId: 'hidden', startsAt: 'tomorrow' })),
  }), response);
});
