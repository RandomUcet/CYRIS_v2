import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDatabaseConnection, eventMemberships, events, getDbClient, notifications, roleAssignments, rolePermissions, roles, users } from '@cyris/db';
import { eq } from 'drizzle-orm';
import { Permissions } from '@cyris/shared';
import { CommandService } from '../modules/command/command.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import type { DatabaseService } from '../modules/database/database.service.js';
import { requireVerifiedIsolatedDatabase, skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('public DEFCON only reaches active participants and keeps private command edits silent', async () => {
  const db = getDbClient({ url: requireVerifiedIsolatedDatabase()! });
  const rollback = new Error('ROLLBACK_READINESS_FIXTURE');
  const eventId = randomUUID(), otherEvent = randomUUID(), roleId = randomUUID();
  const person = (label: string, status = 'ACTIVE') => ({
    id: randomUUID(), email: `${randomUUID()}@example.test`, displayName: label, status,
  });
  const staff = person('Command'), member = person('Participant'), inactive = person('Inactive member');
  const disabled = person('Disabled account', 'DISABLED'), outsider = person('Other exercise');
  try {
    await assert.rejects(db.transaction(async tx => {
      const database = { client: tx } as unknown as DatabaseService;
      const command = new CommandService(database, null!, null!, null!, null!, new AuditService(database),
        null!, null!, new AuthorizationService(database));
      await tx.insert(events).values([eventId, otherEvent].map(id => ({ id, name: 'Readiness', slug: id })));
      await tx.insert(users).values([staff, member, inactive, disabled, outsider]);
      const membershipId = randomUUID(), outsiderMembership = randomUUID();
      await tx.insert(eventMemberships).values([
        { id: membershipId, eventId, userId: staff.id }, { eventId, userId: member.id },
        { eventId, userId: inactive.id, status: 'INACTIVE' }, { eventId, userId: disabled.id },
        { id: outsiderMembership, eventId: otherEvent, userId: outsider.id },
      ]);
      await tx.insert(roles).values({ id: roleId, eventId, slug: 'command', name: 'Command' });
      await tx.insert(rolePermissions).values([Permissions.COMMAND_READ, Permissions.COMMAND_DEFCON_CHANGE]
        .map(permissionKey => ({ roleId, permissionKey, scope: 'EVENT' })));
      await tx.insert(roleAssignments).values({ roleId, membershipId });
      await assert.rejects(command.getReadiness(eventId, outsider), /membership/);
      await assert.rejects(command.getReadiness(eventId, inactive), /membership/);
      await assert.rejects(command.getDefcon(eventId, member), /permission/);
      assert.equal((await command.getReadiness(eventId, member)).level, null);
      const change = { level: 3 as const, publicMessage: 'Porada v 10:00', reason: 'Informace pro štáb', expectedRevision: 0 };
      const writeOnly = randomUUID();
      await tx.insert(roles).values({ id: writeOnly, eventId: otherEvent, slug: 'write-only', name: 'Custom role' });
      await tx.insert(rolePermissions).values({ roleId: writeOnly, permissionKey: Permissions.COMMAND_DEFCON_CHANGE, scope: 'EVENT' });
      await tx.insert(roleAssignments).values({ roleId: writeOnly, membershipId: outsiderMembership });
      await assert.rejects(command.changeDefcon(otherEvent, change, outsider), /command.read/);
      assert.equal((await command.getReadiness(otherEvent, outsider)).initialized, false);
      await assert.rejects(command.changeDefcon(eventId, change, member), /permission/);
      await command.changeDefcon(eventId, change, staff);
      const published = await command.getReadiness(eventId, member);
      assert.equal(published.publicMessage, change.publicMessage);
      assert.equal(published.level, change.level);
      assert(!('reason' in published || 'updatedByUserId' in published || 'history' in published));
      await command.changeDefcon(eventId, { ...change, expectedRevision: 1, reason: 'Doplnění pro štáb' }, staff);
      assert.deepEqual(await command.getReadiness(eventId, member), published);
      const inbox = () => tx.select().from(notifications).where(eq(notifications.eventId, eventId));
      const notices = await inbox();
      assert.deepEqual(notices.map(row => row.userId).sort(), [staff.id, member.id].sort());
      assert(notices.every(row => row.severity === 'URGENT' && !JSON.stringify(row).includes(change.reason)));
      await assert.rejects(command.changeDefcon(eventId, change, staff), /revision conflict/);
      await command.changeDefcon(eventId, { ...change, expectedRevision: 2, publicMessage: '' }, staff);
      assert.equal((await command.getReadiness(eventId, member)).publicMessage, null);
      assert.equal((await inbox()).length, 4);
      throw rollback;
    }), error => error === rollback);
  } finally {
    await closeDatabaseConnection();
  }
});
