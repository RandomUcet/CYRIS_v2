import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthController } from './auth.controller.js';
import type { CyrisRequest } from './guards/auth.guard.js';
import type { FastifyReply } from 'fastify';

test('logout revokes bearer and cookie sessions before audit and clears the production cookie securely', async () => {
  for (const bearer of [true, false]) {
    const calls: string[] = [];
    const token = 'test-session-token';
    const controller = new AuthController(
      { async logout(value: string) { assert.equal(value, token); calls.push('revoke'); } } as never,
      { isProduction: true } as never,
      { async record(input: { actorUserId: string }) { assert.equal(input.actorUserId, 'real-actor'); calls.push('audit'); } } as never,
      {} as never,
      { async validateSession(value: string) { assert.equal(value, token); return { user: { id: 'real-actor' } }; } } as never,
    );
    const req = { headers: bearer ? { authorization: `Bearer ${token}` } : {}, cookies: bearer ? {} : { cyris_session: token }, ip: '127.0.0.1' } as CyrisRequest;
    const reply = { clearCookie(name: string, options: { secure: boolean; httpOnly: boolean }) {
      assert.equal(name, 'cyris_session'); assert.equal(options.secure, true); assert.equal(options.httpOnly, true); calls.push('clear');
    } } as unknown as FastifyReply;
    await controller.logout(req, reply);
    assert.deepEqual(calls, ['revoke', 'clear', 'audit']);
  }
});

test('an audit failure cannot retain the session being logged out', async () => {
  let revoked = false;
  const controller = new AuthController(
    { async logout() { revoked = true; } } as never,
    { isProduction: false } as never,
    { async record() { throw new Error('audit unavailable'); } } as never,
    {} as never,
    { async validateSession() { return { user: { id: 'real-actor' } }; } } as never,
  );
  await assert.rejects(controller.logout({ headers: {}, cookies: { cyris_session: 'test-token' } } as unknown as CyrisRequest,
    { clearCookie() {} } as unknown as FastifyReply), /audit unavailable/);
  assert.equal(revoked, true);
});
