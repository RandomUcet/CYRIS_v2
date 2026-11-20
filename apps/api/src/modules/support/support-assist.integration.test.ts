import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { SupportAssistInput } from '@cyris/contracts';
import type { AIGatewayService, ExecuteAIOperationParams } from '../ai/ai-gateway.service.js';
import type { SessionService, AuthenticatedUser } from '../auth/session.service.js';
import type { ConfigService } from '../config/config.service.js';
import type { QueueService } from '../queue/queue.service.js';
import type { SupportAssistContext, SupportAssistContextService } from './support-assist-context.service.js';
import { SupportAssistCache } from './support-assist-cache.service.js';
import { SupportAssistService } from './support-assist.service.js';

const url = process.env.CYRIS_TEST_REDIS_URL;
const isolated = process.env.CYRIS_TEST_DATABASE_ISOLATED === 'true' && url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
test('EXCON shares completed drafts and rejects duplicates, revoked sessions and stale ticket data', { skip: !isolated, timeout: 12_000 }, async () => {
  const redis = new Redis(url!);
  const operator = { id: randomUUID(), displayName: 'Operator', email: 'operator@example.test', status: 'ACTIVE' };
  const alternate = { ...operator, id: randomUUID() };
  const participant = { ...operator, id: randomUUID() };
  const eventId = randomUUID(), threadId = randomUUID(), now = new Date().toISOString();
  const context: SupportAssistContext = {
    observedAt: now, localDate: now.slice(0, 10), event: { id: eventId, name: 'Exercise', timezone: 'UTC', status: 'ACTIVE' },
    providerVersion: { id: randomUUID(), updatedAt: now }, openCount: null,
    threads: [{ id: threadId, subject: 'Question', requesterId: participant.id, updatedAt: now, status: 'OPEN', category: 'OTHER', revision: 1, excerpts: [] }],
  };
  let revoked = false, calls = 0;
  let whenStarted: () => void = () => {};
  let release: (() => void) | undefined;
  const contexts = { async read(_event: string, user: AuthenticatedUser) {
    if (user.id === participant.id) throw new ForbiddenException();
    return structuredClone(context);
  }} as unknown as SupportAssistContextService;
  const sessions = { async validateSession(token: string) {
    return revoked ? null : { user: token === operator.id ? operator : alternate, session: { expiresAt: new Date(Date.now() + 60_000).toISOString() } };
  }} as unknown as SessionService;
  const gateway = { async execute(params: ExecuteAIOperationParams) {
    calls++;
    assert.equal(params.operationType, 'SUPPORT_REPLY');
    assert.equal(params.options?.maxTokens, 320);
    whenStarted();
    await new Promise<void>(resolve => { release = resolve; });
    return { text: 'Operátor ověří požadavek.' };
  }} as AIGatewayService;
  const cache = new SupportAssistCache({client: redis} as QueueService, {values: {CYRIS_MASTER_KEY: 'a'.repeat(64)}} as ConfigService);
  const service = new SupportAssistService(contexts, cache, gateway, sessions);
  const input: SupportAssistInput = { action: 'REPLY', locale: 'cs', threadId, expectedRevision: 1 };
  const call = (user: AuthenticatedUser) => service.assist(eventId, user, user.id, input);
  try {
    await redis.ping();
    let started = new Promise<void>(resolve => { whenStarted = resolve; });
    const first = call(operator);
    await started;
    await assert.rejects(call(alternate), ConflictException);
    release!();
    const draft = await first;
    assert.equal((await call(alternate)).text, draft.text);
    assert.equal(calls, 1);
    await assert.rejects(call(participant), ForbiddenException);
    revoked = true;
    await assert.rejects(call(operator), UnauthorizedException);
    revoked = false;
    context.threads[0]!.revision++;
    started = new Promise<void>(resolve => { whenStarted = resolve; });
    const cachedLate = call(operator);
    await started;
    context.threads[0]!.revision++;
    release!();
    await assert.rejects(cachedLate, ConflictException);
    assert.equal(calls, 2);
  } finally {
    release?.();
    redis.disconnect();
  }
});
