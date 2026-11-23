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
      const markers = await tx.execute(sql`SELECT user_id, enabled, generation FROM preview_team_accounts ORDER BY user_id`);
      assert.equal(markers.length, previewTeams.length);
      assert(markers.every(marker => marker.enabled === false && marker.generation));
      const staff = await tx.execute(sql`
        SELECT p.permission_key FROM role_permissions p JOIN role_assignments a ON a.role_id=p.role_id
        JOIN event_memberships m ON a.membership_id=m.id WHERE m.event_id=${eventId} AND m.user_id=${accounts.stab!.id}`);
      const keys = staff.map(permission => permission.permission_key);
      for (const permission of ['command.read', 'command.defcon.change', 'document.create', 'task.assign']) assert(keys.includes(permission));
      assert(!keys.includes('registry.read'));
      const medicalGrants = await tx.execute(sql`
        SELECT rp.permission_key, rp.scope, ra.unit_id, u.slug AS unit_slug
        FROM role_assignments ra
        JOIN roles r ON r.id = ra.role_id
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN organizational_units u ON u.id = ra.unit_id
        JOIN event_memberships m ON m.id = ra.membership_id
        WHERE m.event_id = ${eventId}
          AND m.user_id = ${accounts.zdravotnici!.id}
          AND r.slug = 'medical-responder'
      `);
      const expectedMedical = ['medical.read','medical.create','medical.update','medical.triage',
        'medical.observe','medical.intervene','medical.transfer','medical.close'].sort();
      assert.deepEqual(medicalGrants.map(g => String(g.permission_key)).sort(),expectedMedical);
      assert(medicalGrants.every(g => g.scope === 'UNIT' && g.unit_slug === 'zachranna-a-zdravotni-sluzba'));
      const broadMedical = await tx.execute(sql`
        SELECT rp.permission_key FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN role_assignments ra ON ra.role_id = r.id
        JOIN event_memberships m ON m.id = ra.membership_id
        WHERE m.event_id = ${eventId}
          AND m.user_id = ${accounts.zdravotnici!.id}
          AND rp.permission_key LIKE 'medical.%' AND rp.scope = 'EVENT'
      `);
      assert.equal(broadMedical.length,0,'medical preview operator must not inherit exercise-wide medical rights');
      await tx.execute(sql`UPDATE preview_team_accounts SET enabled=true WHERE user_id=${accounts.stab!.id}`);
      const id = rows[0]!.task_id as string;
      await tx.execute(sql`UPDATE operational_tasks SET status='COMPLETED' WHERE id=${id}`);
      await provisionTeamPreview(tx, { eventId, accounts });
      const [retained] = await tx.execute(sql`SELECT enabled, generation FROM preview_team_accounts WHERE user_id=${accounts.stab!.id}`);
      assert.equal(retained!.enabled, true);
      assert.equal(retained!.generation, markers.find(marker => marker.user_id === accounts.stab!.id)!.generation);
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
