import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { getDbClient, closeDatabaseConnection, sql, type CyrisDatabase } from '@cyris/db';
import { bootstrapSystem } from './system-bootstrap.js';
import { requireVerifiedIsolatedDatabase } from '../apps/api/src/regression/isolated-postgres-harness.js';

const url = requireVerifiedIsolatedDatabase();
test('additive bootstrap preserves accounts, audit, operations, lifecycle and administrator customizations', {
  skip: !url && 'Requires CYRIS_TEST_DATABASE_URL and CYRIS_TEST_DATABASE_ISOLATED=true for a disposable local database',
}, async () => {
  const db = getDbClient({ url: url! });
  const rollback = new Error('ROLLBACK_BOOTSTRAP_FIXTURES');
  try {
    await assert.rejects(db.transaction(async (tx) => {
      const connection = tx as unknown as CyrisDatabase;
      const [before] = await tx.execute(sql`SELECT (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM users) AS users;`);
      const empty = await bootstrapSystem(connection);
      const [after] = await tx.execute(sql`SELECT (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM users) AS users;`);
      assert.equal(empty.eventId, null);
      assert.deepEqual(after, before, 'default bootstrap must not invent users or exercises');

      const id = randomUUID();
      const unrelatedId = randomUUID();
      const userId = randomUUID();
      const identityId = randomUUID();
      const resourceId = randomUUID();
      const auditId = randomUUID();
      const integrationId = randomUUID();
      const slug = `bootstrap-test-${id}`;
      await tx.execute(sql`
        INSERT INTO events (id, slug, name, status, default_locale, default_timezone)
        VALUES (${id}, ${slug}, 'Preserve this exercise', 'ACTIVE', 'en', 'UTC'),
          (${unrelatedId}, ${`other-${id}`}, 'Unrelated exercise', 'CLOSED', 'cs', 'Europe/Prague');
      `);
      await tx.execute(sql`INSERT INTO users (id, email, display_name, status) VALUES (${userId}, ${`${id}@example.test`}, 'Preserve operator', 'DISABLED');`);
      await tx.execute(sql`
        INSERT INTO user_identities (id, user_id, provider_type, provider_subject, password_hash)
        VALUES (${identityId}, ${userId}, 'LOCAL', ${`${id}@example.test`}, 'unchanged-test-hash');
      `);
      await tx.execute(sql`INSERT INTO resources (id, event_id, resource_type) VALUES (${resourceId}, ${id}, 'PERSON');`);
      await tx.execute(sql`INSERT INTO audit_events (id, actor_type, action, category) VALUES (${auditId}, 'SYSTEM', 'bootstrap.preservation.fixture', 'TEST');`);
      await tx.execute(sql`
        INSERT INTO integrations (id, name, category, provider_type, enabled, status, config)
        VALUES (${integrationId}, 'Preserve administrator integration', 'AI_PROVIDER', 'OPENAI_COMPATIBLE', false, 'DEGRADED', '{"custom":"preserved"}'::jsonb);
      `);

      const first = await bootstrapSystem(connection, { eventId: id });
      assert.equal(first.unitsCreated, 8);
      assert.equal(first.rolesCreated, 24);
      const [role] = await tx.execute(sql`SELECT id FROM roles WHERE event_id = ${id} AND slug = 'exercise-organizer';`);
      const [assignments] = await tx.execute(sql`SELECT count(*) AS count FROM role_assignments WHERE role_id = ${role!.id};`);
      assert.equal(Number(assignments!.count), 0, 'organizer authority must never be assigned automatically');
      const [unit] = await tx.execute(sql`SELECT id FROM organizational_units WHERE event_id = ${id} LIMIT 1;`);
      await tx.execute(sql`DELETE FROM role_permissions WHERE role_id = ${role!.id};`);
      await tx.execute(sql`DELETE FROM unit_capabilities WHERE unit_id = ${unit!.id};`);
      await tx.execute(sql`UPDATE organizational_units SET name = 'Custom team name' WHERE id = ${unit!.id};`);

      const snapshot = async () => {
        const [row] = await tx.execute(sql`
          SELECT
            (SELECT row_to_json(e) FROM events e WHERE e.id = ${id}) AS event,
            (SELECT row_to_json(e) FROM events e WHERE e.id = ${unrelatedId}) AS other_event,
            (SELECT row_to_json(u) FROM users u WHERE u.id = ${userId}) AS operator,
            (SELECT row_to_json(i) FROM user_identities i WHERE i.id = ${identityId}) AS identity,
            (SELECT row_to_json(r) FROM resources r WHERE r.id = ${resourceId}) AS resource,
            (SELECT row_to_json(a) FROM audit_events a WHERE a.id = ${auditId}) AS audit,
            (SELECT row_to_json(i) FROM integrations i WHERE i.id = ${integrationId}) AS integration,
            (SELECT row_to_json(u) FROM organizational_units u WHERE u.id = ${unit!.id}) AS team;
        `);
        return row;
      };
      const preserved = await snapshot();
      for (let run = 0; run < 2; run++) {
        const result = await bootstrapSystem(connection, { eventSlug: slug, eventName: 'Must not rename existing event' });
        assert.deepEqual(result, { eventId: id, rolesCreated: 0, unitsCreated: 0 });
      }
      assert.deepEqual(await snapshot(), preserved);
      const [custom] = await tx.execute(sql`
        SELECT (SELECT count(*) FROM role_permissions WHERE role_id = ${role!.id}) AS permissions,
          (SELECT count(*) FROM unit_capabilities WHERE unit_id = ${unit!.id}) AS capabilities;
      `);
      assert.equal(Number(custom!.permissions), 0);
      assert.equal(Number(custom!.capabilities), 0);

      const newEvent = await bootstrapSystem(connection, { eventSlug: `explicit-${id}`, eventName: 'Explicit new event' });
      const [created] = await tx.execute(sql`SELECT status FROM events WHERE id = ${newEvent.eventId};`);
      assert.equal(created!.status, 'DRAFT');
      await assert.rejects(bootstrapSystem(connection, { eventId: randomUUID() }), /does not exist/);
      throw rollback;
    }, { isolationLevel: 'repeatable read' }), (error: unknown) => error === rollback);
  } finally {
    await closeDatabaseConnection();
  }
});
