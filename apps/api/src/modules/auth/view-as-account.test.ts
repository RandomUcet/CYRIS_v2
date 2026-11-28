import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ViewAsService } from './view-as.service.js';
import type { CyrisRequest } from './guards/auth.guard.js';

test('View As rechecks target expiry and disabled preview account on every read', async () => {
  const actor = { id: 'admin', email: 'admin@example.test', displayName: 'Admin', status: 'ACTIVE' };
  const target = { id: 'participant', email: 'participant@example.test', displayName: 'Participant', status: 'ACTIVE', testExpiresAt: null as Date | null, previewEnabled: null as boolean | null };
  let row: typeof target | undefined = target;
  let stored = '';
  const query = { from: () => query, leftJoin: () => query, innerJoin: () => query, where: () => query, limit: async () => row ? [row] : [] };
  const service = new ViewAsService(
    { client: { select: () => query } } as never,
    { client: { set: async (_key: string, value: string) => { stored = value; }, get: async () => stored } } as never,
    { assertAuthorized: async () => {}, authorize: async ({user}: {user: {id: string}}) => user.id === actor.id } as never,
    { record: async () => {} } as never,
  );
  const preview = await service.start(actor, 'synthetic-token', { eventId: 'event-a', targetUserId: target.id, reason: 'Synthetic test' });
  const request = () => ({ headers: {'x-cyris-view-as': preview.id}, url: '/auth/me', method: 'GET', user: actor } as unknown as CyrisRequest);
  const valid = request();
  await service.apply(valid, actor, 'synthetic-token');
  assert.equal(valid.user?.id, target.id);
  assert.equal('testExpiresAt' in valid.user!, false);
  for (const change of [{testExpiresAt: new Date(0), previewEnabled: null}, {testExpiresAt: null, previewEnabled: false}]) {
    row = {...target, ...change};
    const denied = request();
    await assert.rejects(service.apply(denied, actor, 'synthetic-token'), /preview has expired/);
    assert.equal(denied.user?.id, actor.id);
    await assert.rejects(service.start(actor, 'synthetic-token', {eventId: 'event-a', targetUserId: target.id, reason: 'Synthetic test'}), /preview has expired/);
  }
  row = undefined;
  await assert.rejects(service.apply(request(), actor, 'synthetic-token'), /preview has expired/);
});
