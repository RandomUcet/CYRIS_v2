import { addMissingEventTemplates, sql, type CyrisDatabase } from '@cyris/db';
import { generateId, Permissions, PermissionScopes } from '@cyris/shared';

export interface BootstrapOptions {
  eventId?: string;
  eventSlug?: string;
  eventName?: string;
}

export function readBootstrapOptions(env: Record<string, string | undefined>): BootstrapOptions {
  const eventId = env.CYRIS_SEED_EVENT_ID?.trim() || undefined;
  const eventSlug = env.CYRIS_SEED_EVENT_SLUG?.trim() || undefined;
  const eventName = env.CYRIS_SEED_EVENT_NAME?.trim() || undefined;
  if (eventId && eventSlug) throw new Error('Select an exercise by ID or slug, not both.');
  if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new Error('CYRIS_SEED_EVENT_ID must be a UUID.');
  }
  if (eventSlug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventSlug) || eventSlug.length > 128)) {
    throw new Error('CYRIS_SEED_EVENT_SLUG must contain lowercase letters, numbers and single hyphens (max 128 characters).');
  }
  if (eventName && (!eventSlug || eventName.length > 255)) {
    throw new Error('CYRIS_SEED_EVENT_NAME requires an exercise slug and must be at most 255 characters.');
  }
  return { eventId, eventSlug, eventName };
}

/**
 * Serializes bootstrap attempts and inserts missing templates in one transaction.
 * Existing roles and teams are administrator-owned: even removed permissions or
 * capabilities are not restored by a subsequent bootstrap.
 */
export async function bootstrapSystem(db: Pick<CyrisDatabase, 'transaction'>, options: BootstrapOptions = {}) {
  const selected = readBootstrapOptions({
    CYRIS_SEED_EVENT_ID: options.eventId,
    CYRIS_SEED_EVENT_SLUG: options.eventSlug,
    CYRIS_SEED_EVENT_NAME: options.eventName,
  });
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cyris-system-bootstrap'));`);
    const [platformRole] = await tx.execute(sql`SELECT id FROM roles WHERE event_id IS NULL AND slug = 'platform-admin' LIMIT 1;`);
    if (!platformRole) {
      const roleId = generateId();
      await tx.execute(sql`
        INSERT INTO roles (id, name, slug, description)
        VALUES (${roleId}, 'Platform Administrator', 'platform-admin', 'Full administrative control over CYRIS');
      `);
      await tx.execute(sql`
        INSERT INTO role_permissions (id, role_id, permission_key, scope)
        VALUES (${generateId()}, ${roleId}, ${Permissions.PLATFORM_MANAGE}, ${PermissionScopes.PLATFORM});
      `);
    }

    let eventId = selected.eventId;
    if (eventId) {
      const [event] = await tx.execute(sql`SELECT id FROM events WHERE id = ${eventId} LIMIT 1;`);
      if (!event) throw new Error('The selected exercise does not exist.');
    } else if (selected.eventSlug) {
      const [event] = await tx.execute(sql`SELECT id FROM events WHERE slug = ${selected.eventSlug} LIMIT 1;`);
      if (event) {
        eventId = event.id as string;
      } else {
        if (!selected.eventName) throw new Error('Set CYRIS_SEED_EVENT_NAME to explicitly create the selected new exercise.');
        eventId = generateId();
        await tx.execute(sql`
          INSERT INTO events (id, slug, name, status, default_locale, default_timezone)
          VALUES (${eventId}, ${selected.eventSlug}, ${selected.eventName}, 'DRAFT', 'cs', 'Europe/Prague');
        `);
      }
    }

    if (!eventId) return { eventId: null, rolesCreated: 0, unitsCreated: 0 };
    return addMissingEventTemplates(tx, eventId);
  });
}

export { canonicalUnits, crisisCommandPermissions, exerciseOrganizerPermissions, laboratoryRoles, teamMemberPermissions } from '@cyris/db';
