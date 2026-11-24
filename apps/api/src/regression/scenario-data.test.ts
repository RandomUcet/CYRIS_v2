import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { closeDatabaseConnection, events, getDbClient, persons, registryMedia, resources, scenarioDraftMedia, users } from '@cyris/db';
import { generateId } from '@cyris/shared';
import { localWorld, fullName, nameKey, samples } from '../modules/scenario-data/world.js';
import { ScenarioDataService } from '../modules/scenario-data/scenario-data.service.js';
import { ScenarioDraftMediaService } from '../modules/scenario-data/scenario-draft-media.service.js';
import { IdentifierAllocatorService } from '../modules/resources/identifier-allocator.service.js';
import { ResourceService } from '../modules/resources/resource.service.js';
import { SearchIndexerService } from '../modules/search/search-indexer.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { requireVerifiedIsolatedDatabase, skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

const empty = { persons: 0, organisations: 0, locations: 0, vehicles: 0, devices: 0, weapons: 0 };
test('three full 5,000-person batches contain distinct, repeatable names including the former zero-state seed', () => {
  const used = new Set<string>();
  for (const seed of [2027, 2027, -1640531527]) {
    const counts = { ...empty, persons: 5000 };
    const w = localWorld(seed, counts, used);
    assert.deepEqual(samples(w), samples(localWorld(seed, counts, used)));
    for (const p of w.persons) {
      const name = nameKey(fullName(p));
      assert(!/\d/.test(name));
      assert(!used.has(name), name);
      used.add(name);
    }
  }
  assert.equal(used.size, 15000);
});

skipWithoutVerifiedDatabase('generator preview, concurrent publication, saved Spark pages and event isolation', async () => {
  const db = getDbClient({ url: requireVerifiedIsolatedDatabase()! });
  const ids = [generateId(), generateId()];
  const [a, b] = ids as [string, string];
  const uid = generateId();
  const user = { id: uid } as any;
  const database = { client: db } as any;
  const audit = new AuditService(database);
  const index = new SearchIndexerService(database, {} as any);
  const resource = new ResourceService(database, audit, {} as any, index);
  let broken = true;
  let calls = 0;
  const ai = {
    getStatus: async (profile: string) => {
      assert.equal(profile, 'DGX_SPARK');
      return { enabled: true };
    },
    execute: async ({ messages, eventId, userId, promptTemplateVersion, options, exclusiveScope }: any) => {
      calls++;
      assert.equal(eventId, a);
      assert.equal(userId, uid);
      assert.match(exclusiveScope, /^scenario-draft:[0-9a-f-]{36}$/);
      const ctx = JSON.parse(messages[1].content);
      if (promptTemplateVersion === 'scenario-blueprint-fast-v1') {
        assert.equal(options.timeoutMs, 45_000);
        assert.equal(options.maxTokens, 450);
        assert.equal(ctx.scenario, 'Regional railway depot');
        return { text: JSON.stringify({ setting: 'Simulované železniční depo', activities: ['předání směny', 'příjem zboží'], roles: ['dispečer', 'technik'], sites: ['depo', 'sklad'], organisations: ['dopravce', 'dodavatel'], equipment: ['přeprava dokumentů', 'evidence materiálu'] }) };
      }
      assert.equal(ctx.brief, 'Regional railway depot');
      assert.equal(ctx.event.name, a);
      if (broken) return { text: 'not JSON' };
      return {
        text: JSON.stringify(Array.from({ length: ctx.count }, (_, i) => ctx.kind === 'persons' ?
          { ...ctx.example, givenName: ctx.suggestedNames[i].split(' ')[0], familyName: ctx.suggestedNames[i].split(' ').slice(1).join(' '), description: 'Koordinuje předání dokumentů v depu.', links: ctx.targets.length ? [0] : [] } : ctx.example))
      };
    },
  };
  const auth = { assertAuthorized: async ({ user: actor }: any) => { if (actor.id !== uid) throw Error('denied'); } };
  const objects = new Map<string, Buffer>();
  const storage = {
    putObject: async (key: string, body: Uint8Array) => {
      objects.set(key, Buffer.from(body));
      return { key, bucket: 'isolated-media' };
    },
    getObject: async (key: string) => ({ body: objects.get(key) ?? new Uint8Array() }),
    deleteObject: async (key: string) => {
      objects.delete(key);
      return { key, bucket: 'isolated-media' };
    },
  };
  const svc = new ScenarioDataService(database, resource, ai as any, new IdentifierAllocatorService(database),
    index, audit, auth as any, storage as any);
  const media = new ScenarioDraftMediaService(database, auth as any, storage as any, audit);
  try {
    await db.insert(users).values({ id: uid, email: uid + '@example.test', displayName: 'Generator test' });
    await db.insert(events).values(ids.map(id => ({ id, slug: id, name: id })));
    const req = { preset: 'CUSTOM' as const, seed: 2027, counts: { ...empty, persons: 6, locations: 2, devices: 2 } };
    const prev = await svc.preview(a, req, user);
    await assert.rejects(() => svc.generate(a, { ...req, previewToken: '0'.repeat(64) }, user), /registry changed/);
    const local = await svc.generate(a, { ...req, previewToken: prev.previewToken }, user);
    const names = await db.select({ displayName: persons.displayName }).from(persons).where(eq(persons.generationBatchId, local.id)).orderBy(persons.identifier);
    assert.deepEqual(names.slice(0, 4).map(p => p.displayName), prev.samples.persons);
    assert.equal(local.relationshipCount, prev.estimatedRelationships);
    await assert.rejects(() => svc.generate(a, req, user), /already exists/);
    await svc.generate(b, req, user);
    const next = await Promise.all([17, 31].map(seed => svc.generate(a, { ...req, seed }, user)));
    const generated = await db.select({ name: persons.displayName }).from(persons).innerJoin(resources, eq(resources.id, persons.id)).where(eq(resources.eventId, a));
    assert.equal(new Set(generated.map(p => p.name)).size, 18);
    assert.notEqual(next[0]!.identifier, next[1]!.identifier);
    const draft = await svc.startDraft(a, { ...req, counts: { ...empty, persons: 13, devices: 1 }, brief: 'Regional railway depot' }, user);
    await assert.rejects(() => svc.advance(b, draft.id, 0, user), /unavailable/);
    await assert.rejects(() => svc.advance(a, draft.id, 0, { id: generateId() } as any), /denied/);
    await assert.rejects(() => svc.advance(a, draft.id, 0, user), /incomplete JSON/);
    assert.equal((await svc.get(a, draft.id, user)).prepared, 0);
    await assert.rejects(() => svc.publish(a, draft.id, user), /Complete the draft/);
    broken = false;
    let page = await svc.advance(a, draft.id, 0, user);
    assert.equal(page.prepared, 1);
    await svc.advance(a, draft.id, 0, user);
    assert.equal(calls, 2);
    page = await svc.advance(a, draft.id, 1, user);
    assert.equal(page.prepared, 13);
    page = await svc.advance(a, draft.id, 13, user);
    assert.equal(page.prepared, 14);
    const raster = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    await assert.rejects(() => media.upload(b, draft.id, {
      kind: 'persons', index: 0, filename: 'person.png', mimeType: 'image/png',
      data: raster.toString('base64'),
    }, user), /not found/);
    const attached = await media.upload(a, draft.id, {
      kind: 'persons', index: 0, filename: 'person.png', mimeType: 'image/png',
      data: raster.toString('base64'),
    }, user);
    assert.equal(attached.index, 0);
    assert.equal((await media.listRecords(a, draft.id, { kind: 'persons', page: 1, limit: 20 }, user))
      .records[0]?.hasImage, true);
    const attachment = (await db.select().from(scenarioDraftMedia)
      .where(eq(scenarioDraftMedia.batchId, draft.id)))[0]!;
    assert.equal(objects.has(attachment.objectKey), true);
    const [pub, repeat] = await Promise.all([svc.publish(a, draft.id, user), svc.publish(a, draft.id, user)]);
    assert.equal(pub.id, repeat.id);
    assert.equal(pub.relationshipCount, 13);
    const rows = await db.select().from(persons).where(eq(persons.generationBatchId, pub.id)).orderBy(persons.identifier);
    assert.equal(rows.length, 13);
    assert.equal(rows[0]?.description, page.personDetails?.[0]?.description);
    const [publishedMedia] = await db.select().from(registryMedia)
      .where(eq(registryMedia.resourceId, rows[0]!.id));
    assert.equal(publishedMedia?.objectKey, attachment.objectKey);
    assert.equal((await db.select().from(scenarioDraftMedia).where(eq(scenarioDraftMedia.batchId,draft.id))).length, 0);

    // Fast hybrid mode creates all records and linked relations with exactly one AI request.
    const fastRequest = { ...req, seed: 9341, counts: { ...empty, persons: 7, locations: 2, organisations: 1, devices: 2 }, brief: 'Regional railway depot', strategy: 'FAST' as const };
    const fast = await svc.startDraft(a, fastRequest, user);
    const beforeFast = calls;
    const fastPage = await svc.advance(a, fast.id, 0, user);
    assert.equal(calls, beforeFast + 1);
    assert.equal(fastPage.prepared, 12);
    assert((fastPage.relationshipCount ?? 0) > 0);
    assert.match(fastPage.personDetails![0]!.description, /železniční depo/);
    assert.equal((await svc.advance(a, fast.id, 0, user)).prepared, 12);
    const completedCalls = calls;
    assert.equal((await svc.advance(a, fast.id, 12, user)).prepared, 12);
    assert.equal(calls, completedCalls, 'completed FAST drafts must not invoke Spark again');
    assert.equal(calls, beforeFast + 1);
    const fastPublished = await svc.publish(a, fast.id, user);
    assert.equal(fastPublished.counts?.persons, 7);
    assert(fastPublished.relationshipCount > 0);
    await svc.cleanup(a, fast.id, user);

    await svc.cleanup(a, draft.id, user);
    assert.equal(objects.has(attachment.objectKey), false);
    assert.equal((await db.select().from(persons).where(eq(persons.generationBatchId, pub.id))).length, 0);
  } finally {
    // The disposable database owns the immutable event audit records.
    await closeDatabaseConnection();
  }
});
