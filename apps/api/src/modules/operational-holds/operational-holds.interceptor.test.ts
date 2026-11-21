import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext, type CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import type { DatabaseService } from '../database/database.service.js';
import type { OperationalHoldsService } from './operational-holds.service.js';
import { OperationalHoldsInterceptor } from './operational-holds.interceptor.js';

function context(route: string, method: string, params: Record<string, string> = {}, user: object | null = { id: 'user-1' }): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ routeOptions: { url: route }, method, params,
    // Attacker-controlled query/body never determines the effective event.
    query: { eventId: 'forged-event' }, body: { eventId: 'forged-event' }, user }) }) } as unknown as ExecutionContext;
}

const next = { handle: () => of('controller-ran') } as CallHandler;

describe('real operational hold enforcement interceptor', () => {
  it('rejects an event-scoped write before controller execution', async () => {
    let checked = 0; let handlerCalls = 0;
    const service = {
      assertWriteAllowed: async (eventId: string, user: object, modules: string[]) => {
        checked++; assert.equal(eventId, 'ea0ef87e-9886-4a79-98bd-51da9cc87807');
        assert.deepEqual(modules, ['medical']);
        throw new ForbiddenException({ code: 'EXERCISE_WRITE_PAUSED' });
      },
    } as unknown as OperationalHoldsService;
    const interceptor = new OperationalHoldsInterceptor({} as DatabaseService, service);
    await assert.rejects(() => interceptor.intercept(context('/events/:eventId/medical', 'POST',
      { eventId: 'ea0ef87e-9886-4a79-98bd-51da9cc87807' }), { handle: () => { handlerCalls++; return of('unexpected'); } }), ForbiddenException);
    assert.equal(checked, 1);
    assert.equal(handlerCalls, 0);
  });

  it('allows event reads and recovery routes without consulting the pause', async () => {
    const service = { assertWriteAllowed: async () => { throw new Error('Must not be invoked'); } } as unknown as OperationalHoldsService;
    const interceptor = new OperationalHoldsInterceptor({} as DatabaseService, service);
    assert.ok(await interceptor.intercept(context('/events/:eventId/medical', 'GET'), next));
    assert.ok(await interceptor.intercept(context('/events/:eventId/operational-holds/:holdId/restore', 'POST'), next));
    assert.ok(await interceptor.intercept(context('/events/:eventId/support', 'POST'), next));
  });

  it('rejects a malformed event identifier instead of silently bypassing the lock', async () => {
    const service = { assertWriteAllowed: async () => {} } as unknown as OperationalHoldsService;
    const interceptor = new OperationalHoldsInterceptor({} as DatabaseService, service);
    await assert.rejects(() => interceptor.intercept(
      context('/events/:eventId/tasks', 'PATCH', { eventId: 'not-a-uuid' }), next,
    ));
  });

  it('does not apply an exercise hold to unrelated global endpoints', async () => {
    const service = { assertWriteAllowed: async () => { throw new Error('Must not be invoked'); } } as unknown as OperationalHoldsService;
    const interceptor = new OperationalHoldsInterceptor({} as DatabaseService, service);
    assert.ok(await interceptor.intercept(context('/auth/logout', 'POST'), next));
  });
});
