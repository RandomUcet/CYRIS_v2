import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service.js';
import type { QueueService } from '../queue/queue.service.js';
import { readFileSync } from 'node:fs';

describe('Login protections', () => {
  it('fails closed when Redis cannot enforce attempts', async () => {
    const queue = { client: { pipeline() { return { incr() { return this; },
      expire() { return this; }, async exec() { throw new Error('Redis unavailable'); } }; } } };
    const limiter = new RateLimitService(queue as unknown as QueueService);
    await assert.rejects(limiter.checkLoginRateLimit('user@example.test', '127.0.0.1'),
      ServiceUnavailableException);
  });
  it('fails closed for incomplete Redis pipelines', async () => {
    const queue = { client: { pipeline() { return { incr() { return this; },
      expire() { return this; }, async exec() { return null; } }; } } };
    const limiter = new RateLimitService(queue as unknown as QueueService);
    await assert.rejects(limiter.checkLoginRateLimit('example', '127.0.0.1'), ServiceUnavailableException);
  });
  it('never trusts a caller-provided forwarded IP for login controls', () => {
    const source = readFileSync(new URL('./auth.controller.ts', import.meta.url), 'utf8');
    assert.ok(!source.includes("const clientIp = (req.headers['x-forwarded-for']"));
    assert.equal((source.match(/const clientIp = req.ip \|\| 'unknown';/g) ?? []).length, 3);
  });
});
