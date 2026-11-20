import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  type CyrisDatabase, eventMemberships, events, membershipUnitAssignments,
  organizationalUnits, roleAssignments, roles, userIdentities,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { LdapGroupMapping } from '@cyris/contracts';

type Store = Pick<CyrisDatabase, 'select' | 'insert' | 'update' | 'delete'>;
type ResolvedMapping = { ldapGroup: string; roleId: string; eventId: string | null; unitId: string | null };
type OwnedRole = { id: string; roleId: string; membershipId: string | null; unitId: string | null };
type OwnedUnit = { id: string; membershipId: string; unitId: string };
type OwnedMembership = { id: string; eventId: string };
type Grants = { version: 1; roles: OwnedRole[]; units: OwnedUnit[]; memberships: OwnedMembership[] };

/** Resolves every configured target; duplicate role slugs require an explicit event. */
export async function resolveLdapMappings(db: Store, mappings: LdapGroupMapping[]): Promise<ResolvedMapping[]> {
  const resolved: ResolvedMapping[] = [];
  for (const mapping of mappings) {
    const matches = await db.select({ id: roles.id, eventId: roles.eventId }).from(roles).where(and(
      eq(roles.slug, mapping.roleSlug),
      mapping.eventId ? eq(roles.eventId, mapping.eventId) : undefined,
    ));
    if (matches.length !== 1) throw new Error(`LDAP role '${mapping.roleSlug}' is missing or ambiguous; select its event`);
    const role = matches[0];
    let unitId: string | null = null;
    if (mapping.unitSlug) {
      if (!role.eventId) throw new Error('A platform role cannot be bound to an exercise unit');
      const [unit] = await db.select({ id: organizationalUnits.id }).from(organizationalUnits).where(and(
        eq(organizationalUnits.eventId, role.eventId), eq(organizationalUnits.slug, mapping.unitSlug), isNull(organizationalUnits.archivedAt),
      ));
      if (!unit) throw new Error(`LDAP unit '${mapping.unitSlug}' does not belong to the mapped role's event`);
      unitId = unit.id;
    }
    resolved.push({ ldapGroup: mapping.ldapGroup, roleId: role.id, eventId: role.eventId, unitId });
  }
  return resolved;
}

function readGrants(metadata: Record<string, unknown>): Grants {
  const value = metadata.ldapGrants as Partial<Grants> | undefined;
  if (!value || value.version !== 1) return { version: 1, roles: [], units: [], memberships: [] };
  return {
    version: 1,
    roles: Array.isArray(value.roles) ? value.roles : [],
    units: Array.isArray(value.units) ? value.units : [],
    memberships: Array.isArray(value.memberships) ? value.memberships : [],
  };
}

const roleKey = (role: Pick<OwnedRole, 'roleId' | 'membershipId' | 'unitId'>) => `${role.roleId}:${role.membershipId ?? ''}:${role.unitId ?? ''}`;
const unitKey = (unit: Pick<OwnedUnit, 'membershipId' | 'unitId'>) => `${unit.membershipId}:${unit.unitId}`;

/** Call inside a transaction with the user/identity locked. Never takes ownership of administrator grants. */
export async function reconcileLdapMemberships(
  db: Store, identityId: string, userId: string, providerId: string,
  mappings: LdapGroupMapping[], groups: string[], metadata: Record<string, unknown>,
): Promise<void> {
  const resolved = await resolveLdapMappings(db, mappings);
  const owned = readGrants(metadata);
  const memberships = await db.select().from(eventMemberships).where(eq(eventMemberships.userId, userId)).for('update');
  const desiredRoles: Omit<OwnedRole, 'id'>[] = [];
  const desiredUnits: Omit<OwnedUnit, 'id'>[] = [];
  const desiredEvents = new Set<string>();

  for (const mapping of resolved.filter((value) => groups.includes(value.ldapGroup))) {
    let membershipId: string | null = null;
    if (mapping.eventId) {
      const [event] = await db.select({ status: events.status }).from(events).where(eq(events.id, mapping.eventId));
      if (!event || event.status === 'CLOSED' || event.status === 'ARCHIVED') continue;
      desiredEvents.add(mapping.eventId);
      let membership = memberships.find((value) => value.eventId === mapping.eventId);
      if (!membership) {
        [membership] = await db.insert(eventMemberships).values({ id: generateId(), eventId: mapping.eventId, userId, status: 'ACTIVE' }).returning();
        memberships.push(membership);
        owned.memberships.push({ id: membership.id, eventId: mapping.eventId });
      }
      // Directory sync must never undo an organizer's suspension, including an earlier LDAP deactivation.
      if (membership.status !== 'ACTIVE') continue;
      membershipId = membership.id;
      if (mapping.unitId) desiredUnits.push({ membershipId, unitId: mapping.unitId });
    }
    desiredRoles.push({ roleId: mapping.roleId, membershipId, unitId: mapping.unitId });
  }

  const membershipIds = memberships.map((value) => value.id);
  const currentRoles = await db.select().from(roleAssignments).where(or(
    eq(roleAssignments.userId, userId),
    membershipIds.length ? inArray(roleAssignments.membershipId, membershipIds) : undefined,
  ));
  const currentUnits = membershipIds.length ? await db.select().from(membershipUnitAssignments).where(inArray(membershipUnitAssignments.membershipId, membershipIds)) : [];
  const nextRoles: OwnedRole[] = [];
  const nextUnits: OwnedUnit[] = [];
  const desiredRoleKeys = new Set(desiredRoles.map(roleKey));
  const desiredUnitKeys = new Set(desiredUnits.map(unitKey));

  for (const previous of owned.roles) {
    const current = currentRoles.find((value) => value.id === previous.id && roleKey(value) === roleKey(previous));
    if (!current) continue; // An administrator edited it; it is no longer our grant.
    if (desiredRoleKeys.has(roleKey(previous))) nextRoles.push(previous);
    else {
      await db.delete(roleAssignments).where(eq(roleAssignments.id, previous.id));
      currentRoles.splice(currentRoles.indexOf(current), 1);
    }
  }
  for (const previous of owned.units) {
    const current = currentUnits.find((value) => value.id === previous.id && unitKey(value) === unitKey(previous));
    if (!current) continue;
    if (desiredUnitKeys.has(unitKey(previous))) nextUnits.push(previous);
    else {
      await db.delete(membershipUnitAssignments).where(eq(membershipUnitAssignments.id, previous.id));
      currentUnits.splice(currentUnits.indexOf(current), 1);
    }
  }
  for (const desired of desiredRoles) {
    if (currentRoles.some((value) => roleKey(value) === roleKey(desired))) continue;
    const [created] = await db.insert(roleAssignments).values({ id: generateId(), ...desired, userId: desired.membershipId ? null : userId }).returning();
    currentRoles.push(created);
    nextRoles.push({ id: created.id, ...desired });
  }
  for (const desired of desiredUnits) {
    if (currentUnits.some((value) => unitKey(value) === unitKey(desired))) continue;
    const [created] = await db.insert(membershipUnitAssignments).values({ id: generateId(), ...desired }).returning();
    currentUnits.push(created);
    nextUnits.push({ id: created.id, ...desired });
  }
  for (const previous of owned.memberships) {
    const membership = memberships.find((value) => value.id === previous.id && value.eventId === previous.eventId);
    if (!membership || membership.status !== 'ACTIVE' || desiredEvents.has(previous.eventId)) continue;
    if (currentRoles.some((value) => value.membershipId === previous.id) || currentUnits.some((value) => value.membershipId === previous.id)) continue;
    await db.update(eventMemberships).set({ status: 'INACTIVE', updatedAt: new Date() }).where(eq(eventMemberships.id, previous.id));
  }
  await db.update(userIdentities).set({
    metadata: { ...metadata, providerId, groups, ldapGrants: { version: 1, roles: nextRoles, units: nextUnits, memberships: owned.memberships } },
    updatedAt: new Date(),
  }).where(eq(userIdentities.id, identityId));
}
