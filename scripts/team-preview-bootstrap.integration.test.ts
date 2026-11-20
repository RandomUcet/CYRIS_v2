import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { closeDatabaseConnection, getDbClient, sql } from '@cyris/db';
import { previewTeams } from '@cyris/contracts';
import { requireVerifiedIsolatedDatabase } from '../apps/api/src/regression/isolated-postgres-harness.js';
import { provisionTeamPreview } from './team-preview-bootstrap.js';

const url = requireVerifiedIsolatedDatabase();
test('seven local team accounts are exercise-scoped and a second setup preserves their work', {
  skip: !url && 'Requires an isolated PostgreSQL database',
}, async () => {
  const db = getDbClient({ url: url! });
  const rollback = new Error('ROLLBACK_TEAM_PREVIEW');
  const eventId = randomUUID();
  const accounts = Object.fromEntries(previewTeams.map(({login}) =>
    [login, {id: randomUUID(), password: randomBytes(24).toString('base64url')}]));
  try {
    await assert.rejects(db.transaction(async tx => {
      await provisionTeamPreview(tx, { eventId, accounts });
      const rows = await tx.execute(sql`
        SELECT u.id, i.password_hash, t.id AS task_id, un.slug
        FROM event_memberships m JOIN users u ON u.id = m.user_id
        JOIN user_identities i ON i.user_id = u.id AND i.provider_type = 'LOCAL'
        JOIN membership_unit_assignments mu ON mu.membership_id = m.id
        JOIN organizational_units un ON un.id = mu.unit_id AND un.event_id = m.event_id
        JOIN operational_tasks t ON t.assigned_user_id = u.id AND t.assigned_unit_id = un.id AND t.event_id = m.event_id
        WHERE m.event_id = ${eventId}
      `);
      assert.equal(rows.length, previewTeams.length);
      for (const team of previewTeams) {
        const row = rows.find(row => row.slug === team.slug);
        assert.equal(row?.id, accounts[team.login]!.id);
        assert.match(String(row?.password_hash), /^\$argon2id\$/);
      }
      const id = rows[0]!.task_id as string;
      await tx.execute(sql`UPDATE operational_tasks SET status='COMPLETED' WHERE id=${id}`);
      await provisionTeamPreview(tx, { eventId, accounts });
      const [state] = await tx.execute(sql`SELECT status FROM operational_tasks WHERE id=${id}`);
      assert.equal(state!.status, 'COMPLETED');
      const forbidden = await tx.execute(sql`
        SELECT ra.id FROM role_assignments ra JOIN roles r ON r.id = ra.role_id
        JOIN event_memberships m ON m.user_id = ra.user_id OR m.id = ra.membership_id
        WHERE m.event_id = ${eventId} AND (ra.user_id IS NOT NULL OR r.event_id IS DISTINCT FROM m.event_id)
      `);
      assert.equal(forbidden.length, 0);
      await assert.rejects(provisionTeamPreview(tx, { eventId: randomUUID(), accounts }), /vlastní přístupové údaje/);
      throw rollback;
    }), error => error === rollback);
  } finally { await closeDatabaseConnection(); }
});
