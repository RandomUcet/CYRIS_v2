import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { HttpException } from '@nestjs/common';
import { AIAdmissionService } from './ai-admission.service.js';
import type { ConfigService } from '../config/config.service.js';

const url = process.env.CYRIS_TEST_REDIS_URL;
const isolated = process.env.CYRIS_TEST_DATABASE_ISOLATED === 'true' && url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);

test('AI admission across two replicas reserves EXCON capacity, rejects a burst and releases failed calls', { skip: !isolated, timeout: 12_000 }, async () => {
  const config = { values: { REDIS_URL: url, CYRIS_AI_MAX_CONCURRENT: 2 } } as ConfigService;
  const replicas = [new AIAdmissionService(config), new AIAdmissionService(config)];
  const expectStatus = (status: number) => (e: unknown) => e instanceof HttpException && e.getStatus() === status;
  const holds: Array<() => void> = [];
  let active = 0, peak = 0;
  const hold = () => new Promise<void>(resolve => {
    peak = Math.max(peak, ++active);
    holds.push(() => { active--; resolve(); });
  });
  try {
    for (const service of replicas) {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        try { await service.run('regular', null, 1000, async () => {}); ready = true; break; }
        catch (err) { if (!expectStatus(503)(err)) throw err; await delay(20); }
      }
      assert.ok(ready);
    }
    const ordinary = replicas[0]!.run('regular', 'ordinary', 5000, hold);
    while (holds.length < 1) await delay(5);
    const rejected = await Promise.allSettled(Array.from({ length: 50 }, (_, i) =>
      replicas[i % 2]!.run('regular', 'burst-' + i, 5000, async () => assert.fail('overflow reached model'))));
    assert.equal(rejected.filter(result => result.status === 'rejected' && expectStatus(429)(result.reason)).length, 50);
    await assert.rejects(replicas[1]!.run('support', 'ordinary', 5000, hold), expectStatus(429));
    const priority = replicas[1]!.run('support', 'operator', 5000, hold);
    while (holds.length < 2) await delay(5);
    await assert.rejects(replicas[0]!.run('support', 'other-operator', 5000, hold), expectStatus(429));
    assert.equal(peak, 2);
    assert.deepEqual(await replicas[0]!.snapshot(),{limit:2,active:2,regular:1});
    holds.splice(0).forEach(release => release());
    await Promise.all([ordinary, priority]);
    assert.deepEqual(await replicas[1]!.snapshot(),{limit:2,active:0,regular:0});
    await assert.rejects(replicas[0]!.run('support', 'operator', 1000, async () => { throw Error('provider timeout'); }), /provider timeout/);
    assert.equal(await replicas[1]!.run('regular', 'operator', 1000, async () => 'ok'), 'ok');
    replicas[0]!.onModuleDestroy();
    await assert.rejects(replicas[0]!.run('regular', 'offline', 1000, async () => assert.fail('offline reached provider')), expectStatus(503));
  } finally {
    holds.splice(0).forEach(release => release());
    replicas.forEach(service => service.onModuleDestroy());
  }
});

test('exclusive inference scope rejects duplicate draft work across different users and replicas', { skip: !isolated, timeout: 12_000 }, async () => {
  const config = { values: { REDIS_URL: url, CYRIS_AI_MAX_CONCURRENT: 3 } } as ConfigService;
  const replicas = [new AIAdmissionService(config), new AIAdmissionService(config)];
  const expectStatus = (status: number) => (e: unknown) => e instanceof HttpException && e.getStatus() === status;
  let release!: () => void;
  let entered!: () => void;
  const readyWork = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let first: Promise<void> | undefined;
  try {
    for (const service of replicas) {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        try { await service.run('regular', null, 1000, async () => {}); ready = true; break; }
        catch (err) { if (!expectStatus(503)(err)) throw err; await delay(20); }
      }
      assert.ok(ready);
    }
    first = replicas[0]!.run('regular', 'draft-operator-one', 5000, async () => { entered(); await held; }, 'scenario-draft:test-a');
    await Promise.race([readyWork, first]);
    await assert.rejects(replicas[1]!.run('regular', 'draft-operator-two', 5000, async () => assert.fail('duplicate draft reached provider'), 'scenario-draft:test-a'), expectStatus(429));
    assert.equal(await replicas[1]!.run('regular', 'draft-operator-two', 1000, async () => 'other draft', 'scenario-draft:test-b'), 'other draft');
    release();
    await first;
    await assert.rejects(replicas[1]!.run('regular', 'draft-operator-two', 1000, async () => { throw Error('provider failure'); }, 'scenario-draft:test-a'), /provider failure/);
    assert.equal(await replicas[0]!.run('regular', 'draft-operator-one', 1000, async () => 'resumed', 'scenario-draft:test-a'), 'resumed');
  } finally {
    release();
    await first?.catch(() => undefined);
    replicas.forEach(service => service.onModuleDestroy());
  }
});
