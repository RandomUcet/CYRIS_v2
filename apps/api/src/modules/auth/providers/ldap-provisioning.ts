import { BadRequestException } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import {
  type CyrisDatabase, eventMemberships, events, membershipUnitAssignments,
  organizationalUnits, roleAssignments, rolePermissions, roles, userIdentities,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import { LdapTeamAccountQuerySchema, LdapTeamAssignmentSchema, type LdapGroupMapping, type LdapTeamAssignment } from '@cyris/contracts';
import { validateEventRolePermissions } from '../../events/event-role-permissions.js';

type Store = Pick<CyrisDatabase, 'select' | 'insert' | 'update' | 'delete'>;
type Target = { eventId: string; roleId: string; unitId: string | null };
type OwnedRole = { id: string; roleId: string; membershipId: string | null; unitId: string | null };
type OwnedUnit = { id: string; membershipId: string; unitId: string };
type OwnedMembership = { id: string; eventId: string };
type Grants = { version: 1; roles: OwnedRole[]; units: OwnedUnit[]; memberships: OwnedMembership[] };
type TeamOverrides = Record<string, Exclude<LdapTeamAssignment, { mode: 'DIRECTORY' }>>;

export function readTeamOverrides(metadata: Record<string, unknown>): TeamOverrides {
  const result: TeamOverrides = {};
  const stored = metadata.ldapTeamOverrides;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return result;
  for (const [key, raw] of Object.entries(stored)) {
    if (!LdapTeamAccountQuerySchema.shape.eventId.safeParse(key).success) continue;
    const choice = LdapTeamAssignmentSchema.safeParse(raw);
    if (choice.success && choice.data.mode !== 'DIRECTORY') result[key] = choice.data;
  }
  return result;
}

async function resolveLdapTarget(
  db: Store, selector: LdapGroupMapping | { eventId: string; roleId: string; unitId: string },
): Promise<Target> {
  const matches = await db.select({ id: roles.id, eventId: roles.eventId }).from(roles).where(and(
    'roleId' in selector ? eq(roles.id, selector.roleId) : eq(roles.slug, selector.roleSlug),
    selector.eventId ? eq(roles.eventId, selector.eventId) : isNotNull(roles.eventId),
  )).limit(2).for('share');
  const role = matches[0];
  if (matches.length !== 1 || !role?.eventId) {
    throw new BadRequestException('Vyberte roli patřící k jednomu konkrétnímu cvičení.');
  }
  const permissions = await db.select({ permissionKey: rolePermissions.permissionKey, scope: rolePermissions.scope })
    .from(rolePermissions).where(eq(rolePermissions.roleId, role.id));
  validateEventRolePermissions(permissions);
  const unitFilter = 'unitId' in selector ? eq(organizationalUnits.id, selector.unitId) :
    selector.unitSlug ? eq(organizationalUnits.slug, selector.unitSlug) : undefined;
  let unitId: string | null = null;
  if (unitFilter) {
    const [unit] = await db.select({ id: organizationalUnits.id }).from(organizationalUnits).where(and(
      eq(organizationalUnits.eventId, role.eventId), unitFilter, isNull(organizationalUnits.archivedAt),
    )).limit(1).for('share');
    if (!unit) throw new BadRequestException('Vyberte dostupný tým ze stejného cvičení jako role.');
    unitId = unit.id;
  }
  return { roleId: role.id, eventId: role.eventId, unitId };
}

/** Configuration writes resolve even legacy unscoped slugs to a specific event. */
export async function resolveLdapMappings(db: Store, mappings: LdapGroupMapping[]) {
  const resolved: LdapGroupMapping[] = [];
  for (const mapping of mappings) {
    const { eventId } = await resolveLdapTarget(db, mapping);
    resolved.push({ ...mapping, eventId });
  }
  return resolved;
}

export async function validateManualTeam(db: Store, eventId: string, choice: Extract<LdapTeamAssignment, { mode: 'MANUAL' }>) {
  await resolveLdapTarget(db, { eventId, roleId: choice.roleId, unitId: choice.unitId });
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

async function resolveAccountTargets(
  db: Store, mappings: LdapGroupMapping[], groups: string[], groupDns: string[], overrides: TeamOverrides, onlyEventId?: string,
) {
  const activeGroups = new Set(groups.map(group => group.trim().toLowerCase()));
  const activeDns = new Set(groupDns.map(dn => dn.trim().toLowerCase()));
  const choices: Array<LdapGroupMapping | { eventId: string; roleId: string; unitId: string }> = [];
  for (const mapping of mappings) {
    const key = mapping.ldapGroup.trim().toLowerCase();
    // A literal CN resembling a DN cannot match a rule for a different directory object.
    const directoryValues = /^[a-z0-9.-]+=/.test(key) ? activeDns : activeGroups;
    if (!directoryValues.has(key)) continue;
    if (mapping.eventId && (overrides[mapping.eventId] || (onlyEventId && onlyEventId !== mapping.eventId))) continue;
    choices.push(mapping);
  }
  for (const [eventId, choice] of Object.entries(overrides)) {
    if (choice.mode === 'MANUAL' && (!onlyEventId || onlyEventId === eventId)) choices.push({ eventId, ...choice });
  }
  const targets: Target[] = [];
  for (const choice of choices) {
    try {
      const target = await resolveLdapTarget(db, choice);
      if (onlyEventId && target.eventId !== onlyEventId) continue;
      if ('roleSlug' in choice && overrides[target.eventId]) continue;
      targets.push(target);
    } catch (error) {
      // Removed roles, archived units and obsolete platform rules grant nothing.
      // An actual database error must roll back the reconciliation.
      if (!(error instanceof BadRequestException)) throw error;
    }
  }
  return targets;
}

/** Caller locks user and identity in one transaction. Row IDs record precisely which grants this integration owns. */
export async function reconcileLdapMemberships(
  db: Store, identityId: string, userId: string, providerId: string,
  mappings: LdapGroupMapping[], groups: string[], metadata: Record<string, unknown>, onlyEventId?: string,
): Promise<void> {
  const dns = Array.isArray(metadata.groupDns) ? metadata.groupDns.filter((value): value is string => typeof value === 'string') : [];
  const targets = await resolveAccountTargets(db, mappings, groups, dns, readTeamOverrides(metadata), onlyEventId);
  const owned = readGrants(metadata);
  const memberships = await db.select().from(eventMemberships).where(and(eq(eventMemberships.userId, userId),
    onlyEventId ? eq(eventMemberships.eventId, onlyEventId) : undefined)).for('update');
  const desiredRoles: Omit<OwnedRole, 'id'>[] = [];
  const desiredUnits: Omit<OwnedUnit, 'id'>[] = [];
  const desiredEvents = new Set<string>();

  for (const target of targets) {
    const [event] = await db.select({ status: events.status }).from(events).where(eq(events.id, target.eventId));
    if (!event || event.status === 'CLOSED' || event.status === 'ARCHIVED') continue;
    desiredEvents.add(target.eventId);
    let membership = memberships.find(value => value.eventId === target.eventId);
    if (!membership) {
      [membership] = await db.insert(eventMemberships).values({ eventId: target.eventId, userId, status: 'ACTIVE' }).returning();
      memberships.push(membership);
      owned.memberships.push({ id: membership.id, eventId: target.eventId });
    }
    if (membership.status !== 'ACTIVE') {
      if (membership.ldapDeactivatedBy !== identityId) continue;
      await db.update(eventMemberships).set({ status: 'ACTIVE', ldapDeactivatedBy: null, updatedAt: new Date() })
        .where(eq(eventMemberships.id, membership.id));
      membership.status = 'ACTIVE';
      membership.ldapDeactivatedBy = null;
    }
    const membershipId = membership.id;
    if (target.unitId) desiredUnits.push({ membershipId, unitId: target.unitId });
    desiredRoles.push({ roleId: target.roleId, membershipId, unitId: target.unitId });
  }

  const membershipIds = memberships.map(value => value.id);
  const currentRoles = !onlyEventId || membershipIds.length ? await db.select().from(roleAssignments).where(or(
    !onlyEventId ? eq(roleAssignments.userId, userId) : undefined,
    membershipIds.length ? inArray(roleAssignments.membershipId, membershipIds) : undefined,
  )) : [];
  const currentUnits = membershipIds.length ? await db.select().from(membershipUnitAssignments)
    .where(inArray(membershipUnitAssignments.membershipId, membershipIds)) : [];
  const outsideScope = (membershipId: string | null) => Boolean(onlyEventId && (!membershipId || !membershipIds.includes(membershipId)));
  const nextRoles = owned.roles.filter(value => outsideScope(value.membershipId));
  const nextUnits = owned.units.filter(value => outsideScope(value.membershipId));
  const desiredRoleKeys = new Set(desiredRoles.map(roleKey));
  const desiredUnitKeys = new Set(desiredUnits.map(unitKey));

  for (const previous of owned.roles) {
    const current = currentRoles.find(value => value.id === previous.id && roleKey(value) === roleKey(previous));
    if (!current) continue; // A different record, even with the same role, belongs to its creator.
    if (desiredRoleKeys.has(roleKey(previous))) nextRoles.push(previous);
    else {
      await db.delete(roleAssignments).where(eq(roleAssignments.id, previous.id));
      currentRoles.splice(currentRoles.indexOf(current), 1);
    }
  }
  for (const previous of owned.units) {
    const current = currentUnits.find(value => value.id === previous.id && unitKey(value) === unitKey(previous));
    if (!current) continue;
    if (desiredUnitKeys.has(unitKey(previous))) nextUnits.push(previous);
    else {
      await db.delete(membershipUnitAssignments).where(eq(membershipUnitAssignments.id, previous.id));
      currentUnits.splice(currentUnits.indexOf(current), 1);
    }
  }
  for (const desired of desiredRoles) {
    if (currentRoles.some(value => roleKey(value) === roleKey(desired))) continue;
    const [created] = await db.insert(roleAssignments).values({ id: generateId(), ...desired }).returning();
    currentRoles.push(created);
    nextRoles.push({ id: created.id, ...desired });
  }
  for (const desired of desiredUnits) {
    if (currentUnits.some(value => unitKey(value) === unitKey(desired))) continue;
    const [created] = await db.insert(membershipUnitAssignments).values({ id: generateId(), ...desired }).returning();
    currentUnits.push(created);
    nextUnits.push({ id: created.id, ...desired });
  }
  for (const previous of owned.memberships) {
    const membership = memberships.find(value => value.id === previous.id && value.eventId === previous.eventId);
    if (!membership || membership.status !== 'ACTIVE' || desiredEvents.has(previous.eventId)) continue;
    if (currentRoles.some(value => value.membershipId === previous.id) || currentUnits.some(value => value.membershipId === previous.id)) continue;
    await db.update(eventMemberships).set({ status: 'INACTIVE', ldapDeactivatedBy: identityId, updatedAt: new Date() })
      .where(eq(eventMemberships.id, previous.id));
  }
  await db.update(userIdentities).set({
    metadata: { ...metadata, providerId, groups, ldapGrants: { version: 1, roles: nextRoles, units: nextUnits, memberships: owned.memberships } },
    updatedAt: new Date(),
  }).where(eq(userIdentities.id, identityId));
}
