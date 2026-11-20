import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, desc, inArray, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import {
  events,
  eventMemberships,
  organizationalUnits,
  membershipUnitAssignments,
  unitCapabilities,
  roles,
  rolePermissions,
  roleAssignments,
  users,
} from '@cyris/db';
import { Permissions, PermissionScopes, generateId } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type {
  CreateEventRequest,
  UpdateEventRequest,
  AddMembershipRequest,
  UpdateMembershipRequest,
  CreateUnitRequest,
  UpdateUnitRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  AssignRoleRequest,
} from '@cyris/contracts';

@Injectable()
export class EventsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authzService: AuthorizationService,
    private readonly auditService: AuditService,
    private readonly searchIndexerService: SearchIndexerService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  // ============================================================================
  // Events
  // ============================================================================

  async listEvents(user: AuthenticatedUser) {
    const isPlatformAdmin = await this.authzService.authorize({
      user,
      permission: Permissions.PLATFORM_MANAGE,
    });

    if (isPlatformAdmin) {
      return this.db.select().from(events).orderBy(desc(events.createdAt));
    }

    // Memberships only
    const userMemberships = await this.db
      .select({ eventId: eventMemberships.eventId })
      .from(eventMemberships)
      .where(and(eq(eventMemberships.userId, user.id), eq(eventMemberships.status, 'ACTIVE')));

    if (userMemberships.length === 0) {
      return [];
    }

    const eventIds = userMemberships.map((m) => m.eventId);
    return this.db
      .select()
      .from(events)
      .where(inArray(events.id, eventIds))
      .orderBy(desc(events.createdAt));
  }

  async createEvent(data: CreateEventRequest, actorUserId?: string, requestId?: string) {
    const [existing] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, data.slug))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Event with slug '${data.slug}' already exists`);
    }

    const [created] = await this.db
      .insert(events)
      .values({
        slug: data.slug,
        name: data.name,
        description: data.description,
        status: data.status,
        defaultLocale: data.defaultLocale ?? 'en',
        defaultTimezone: data.defaultTimezone ?? 'UTC',
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
      })
      .returning();

    await this.auditService.record({
      action: 'event.created',
      category: 'event',
      eventId: created!.id,
      resourceType: 'event',
      resourceId: created!.id,
      actorUserId,
      requestId,
      metadata: {
        slug: created!.slug,
        name: created!.name,
        status: created!.status,
      },
    });

    await this.searchIndexerService.emitSearchUpsert('event', created!.id);

    return created;
  }

  async getEvent(eventId: string) {
    const [event] = await this.db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new NotFoundException(`Event '${eventId}' not found`);
    }

    return event;
  }

  private validateStatusTransition(currentStatus: string, targetStatus: string): void {
    if (currentStatus === targetStatus) return;

    const validTransitions: Record<string, string[]> = {
      DRAFT: ['PREPARATION', 'ARCHIVED'],
      PREPARATION: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
      ACTIVE: ['CLOSED', 'PREPARATION', 'ARCHIVED'],
      CLOSED: ['ACTIVE', 'ARCHIVED'],
      ARCHIVED: ['DRAFT', 'PREPARATION'],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid lifecycle transition from ${currentStatus} to ${targetStatus}. Allowed transitions: ${allowed.join(', ')}`
      );
    }
  }

  async updateEvent(
    eventId: string,
    data: UpdateEventRequest,
    actorUserId?: string,
    requestId?: string
  ) {
    const existing = await this.getEvent(eventId);

    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (data.name !== undefined && data.name !== existing.name) {
      updatePayload.name = data.name;
      changes.name = { from: existing.name, to: data.name };
    }
    if (data.description !== undefined && data.description !== existing.description) {
      updatePayload.description = data.description;
      changes.description = { from: existing.description, to: data.description };
    }
    if (data.status !== undefined && data.status !== existing.status) {
      this.validateStatusTransition(existing.status, data.status);
      updatePayload.status = data.status;
      if (data.status === 'ARCHIVED' && !existing.archivedAt) {
        updatePayload.archivedAt = new Date();
      }
      changes.status = { from: existing.status, to: data.status };
    }
    if (data.defaultLocale !== undefined && data.defaultLocale !== existing.defaultLocale) {
      updatePayload.defaultLocale = data.defaultLocale;
      changes.defaultLocale = { from: existing.defaultLocale, to: data.defaultLocale };
    }
    if (data.defaultTimezone !== undefined && data.defaultTimezone !== existing.defaultTimezone) {
      updatePayload.defaultTimezone = data.defaultTimezone;
      changes.defaultTimezone = { from: existing.defaultTimezone, to: data.defaultTimezone };
    }
    if (data.startsAt !== undefined) {
      const parsedStarts = data.startsAt ? new Date(data.startsAt) : null;
      updatePayload.startsAt = parsedStarts;
      changes.startsAt = { from: existing.startsAt, to: parsedStarts };
    }
    if (data.endsAt !== undefined) {
      const parsedEnds = data.endsAt ? new Date(data.endsAt) : null;
      updatePayload.endsAt = parsedEnds;
      changes.endsAt = { from: existing.endsAt, to: parsedEnds };
    }
    if (data.archivedAt !== undefined) {
      const parsedArchived = data.archivedAt ? new Date(data.archivedAt) : null;
      updatePayload.archivedAt = parsedArchived;
      changes.archivedAt = { from: existing.archivedAt, to: parsedArchived };
    }

    const [updated] = await this.db
      .update(events)
      .set(updatePayload)
      .where(eq(events.id, eventId))
      .returning();

    const isArchived = data.status === 'ARCHIVED' || data.archivedAt !== undefined;
    await this.auditService.record({
      action: isArchived ? 'event.archived' : 'event.updated',
      category: 'event',
      eventId,
      resourceType: 'event',
      resourceId: eventId,
      actorUserId,
      requestId,
      changes: Object.keys(changes).length > 0 ? changes : null,
    });

    await this.searchIndexerService.emitSearchUpsert('event', eventId);

    return updated;
  }

  async archiveEvent(eventId: string, actorUserId?: string, requestId?: string) {
    return this.updateEvent(
      eventId,
      { status: 'ARCHIVED', archivedAt: new Date().toISOString() },
      actorUserId,
      requestId
    );
  }

  async duplicateEvent(
    sourceEventId: string,
    data: { slug: string; name: string; description?: string; startsAt?: string; endsAt?: string },
    actorUserId?: string,
    requestId?: string
  ) {
    const source = await this.getEvent(sourceEventId);

    const [existing] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, data.slug))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Event with slug '${data.slug}' already exists`);
    }

    const newEventId = generateId();
    const [created] = await this.db
      .insert(events)
      .values({
        id: newEventId,
        slug: data.slug,
        name: data.name,
        description: data.description ?? source.description,
        status: 'DRAFT',
        defaultLocale: source.defaultLocale,
        defaultTimezone: source.defaultTimezone,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
      })
      .returning();

    // Clone Organizational Units & Capabilities
    const sourceUnits = await this.db
      .select()
      .from(organizationalUnits)
      .where(eq(organizationalUnits.eventId, sourceEventId));

    const unitIdMap = new Map<string, string>();
    for (const u of sourceUnits) {
      unitIdMap.set(u.id, generateId());
    }

    for (const u of sourceUnits) {
      const newUnitId = unitIdMap.get(u.id)!;
      const newParentId = u.parentUnitId ? unitIdMap.get(u.parentUnitId) ?? null : null;
      await this.db.insert(organizationalUnits).values({
        id: newUnitId,
        eventId: newEventId,
        parentUnitId: newParentId,
        name: u.name,
        slug: u.slug,
        kind: u.kind,
        description: u.description,
      });

      const caps = await this.db
        .select()
        .from(unitCapabilities)
        .where(eq(unitCapabilities.unitId, u.id));

      for (const cap of caps) {
        await this.db.insert(unitCapabilities).values({
          id: generateId(),
          unitId: newUnitId,
          capabilityKey: cap.capabilityKey,
          configuration: cap.configuration,
        });
      }
    }

    // Clone Event-Scoped Roles & Permissions
    const sourceRoles = await this.db
      .select()
      .from(roles)
      .where(eq(roles.eventId, sourceEventId));

    for (const r of sourceRoles) {
      const newRoleId = generateId();
      await this.db.insert(roles).values({
        id: newRoleId,
        eventId: newEventId,
        name: r.name,
        slug: r.slug,
        description: r.description,
      });

      const perms = await this.db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, r.id));

      for (const p of perms) {
        await this.db.insert(rolePermissions).values({
          id: generateId(),
          roleId: newRoleId,
          permissionKey: p.permissionKey,
          scope: p.scope,
        });
      }
    }

    // Add membership for creator
    if (actorUserId) {
      await this.db.insert(eventMemberships).values({
        id: generateId(),
        eventId: newEventId,
        userId: actorUserId,
        status: 'ACTIVE',
      });
    }

    await this.auditService.record({
      action: 'event.duplicated',
      category: 'event',
      eventId: newEventId,
      resourceType: 'event',
      resourceId: newEventId,
      actorUserId,
      requestId,
      metadata: {
        sourceEventId,
        slug: created!.slug,
        name: created!.name,
        status: created!.status,
      },
    });

    await this.searchIndexerService.emitSearchUpsert('event', newEventId);

    return created;
  }

  // ============================================================================
  // Memberships
  // ============================================================================

  async listMemberships(eventId: string, actor?: AuthenticatedUser) {
    await this.getEvent(eventId);

    const rows = await this.db
      .select({
        id: eventMemberships.id,
        eventId: eventMemberships.eventId,
        userId: eventMemberships.userId,
        status: eventMemberships.status,
        joinedAt: eventMemberships.joinedAt,
        userEmail: users.email,
        userDisplayName: users.displayName,
        userStatus: users.status,
      })
      .from(eventMemberships)
      .innerJoin(users, eq(eventMemberships.userId, users.id))
      .where(eq(eventMemberships.eventId, eventId))
      .orderBy(desc(eventMemberships.joinedAt));

    const isAdmin=actor && await this.authzService.authorize({user:actor,permission:Permissions.PLATFORM_MANAGE});
    const ids=rows.map(r=>r.id);
    const assignments=ids.length ? await this.db.select({membershipId:roleAssignments.membershipId,id:roles.id,name:roles.name,slug:roles.slug})
      .from(roleAssignments).innerJoin(roles,eq(roles.id,roleAssignments.roleId)).where(and(inArray(roleAssignments.membershipId,ids),eq(roles.eventId,eventId))) : [];
    const units=ids.length ? await this.db.select({membershipId:membershipUnitAssignments.membershipId,id:organizationalUnits.id,name:organizationalUnits.name,slug:organizationalUnits.slug})
      .from(membershipUnitAssignments).innerJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId)).where(and(inArray(membershipUnitAssignments.membershipId,ids),eq(organizationalUnits.eventId,eventId))) : [];
    const platform=isAdmin && rows.length ? await this.db.select({userId:roleAssignments.userId,id:roles.id,name:roles.name,slug:roles.slug})
      .from(roleAssignments).innerJoin(roles,eq(roles.id,roleAssignments.roleId)).where(and(inArray(roleAssignments.userId,rows.map(r=>r.userId)),isNull(roles.eventId),isNull(roleAssignments.membershipId),isNull(roleAssignments.unitId))) : [];
    return rows.map(r=>({id:r.id,eventId:r.eventId,userId:r.userId,status:r.status,joinedAt:r.joinedAt.toISOString(),
      user:{id:r.userId,email:r.userEmail,displayName:r.userDisplayName,status:r.userStatus},
      roles:assignments.filter(a=>a.membershipId===r.id).map(({id,name,slug})=>({id,name,slug})),
      units:units.filter(a=>a.membershipId===r.id).map(({id,name,slug})=>({id,name,slug})),
      platformRoles:platform.filter(a=>a.userId===r.userId).map(({id,name,slug})=>({id,name,slug})),
    }));
  }

  async addMembership(
    eventId: string,
    data: AddMembershipRequest,
    actorUserId?: string,
    requestId?: string
  ) {
    await this.getEvent(eventId);

    const [existing] = await this.db
      .select({ id: eventMemberships.id })
      .from(eventMemberships)
      .where(
        and(
          eq(eventMemberships.eventId, eventId),
          eq(eventMemberships.userId, data.userId)
        )
      )
      .limit(1);

    if (existing) {
      throw new ConflictException('User is already a member of this event');
    }

    const [created] = await this.db
      .insert(eventMemberships)
      .values({
        eventId,
        userId: data.userId,
        status: data.status,
      })
      .returning();

    await this.auditService.record({
      action: 'membership.created',
      category: 'membership',
      eventId,
      resourceType: 'membership',
      resourceId: created!.id,
      actorUserId,
      requestId,
      metadata: {
        userId: data.userId,
        status: data.status,
      },
    });

    return created;
  }

  async updateMembership(
    eventId: string,
    membershipId: string,
    data: UpdateMembershipRequest,
    actorUserId?: string,
    requestId?: string
  ) {
    const [membership] = await this.db
      .select()
      .from(eventMemberships)
      .where(
        and(
          eq(eventMemberships.id, membershipId),
          eq(eventMemberships.eventId, eventId)
        )
      )
      .limit(1);

    if (!membership) {
      throw new NotFoundException(`Membership '${membershipId}' not found in event`);
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (data.status !== undefined && data.status !== membership.status) {
      changes.status = { from: membership.status, to: data.status };
    }

    const [updated] = await this.db
      .update(eventMemberships)
      .set({ status: data.status, updatedAt: new Date() })
      .where(eq(eventMemberships.id, membershipId))
      .returning();

    await this.auditService.record({
      action: 'membership.updated',
      category: 'membership',
      eventId,
      resourceType: 'membership',
      resourceId: membershipId,
      actorUserId,
      requestId,
      changes: Object.keys(changes).length > 0 ? changes : null,
    });

    return updated;
  }

  // ============================================================================
  // Organizational Units
  // ============================================================================

  async listUnits(eventId: string) {
    await this.getEvent(eventId);

    const units = await this.db
      .select()
      .from(organizationalUnits)
      .where(eq(organizationalUnits.eventId, eventId))
      .orderBy(organizationalUnits.name);

    if (units.length === 0) return [];

    const allCaps = await this.db
      .select()
      .from(unitCapabilities)
      .where(
        inArray(
          unitCapabilities.unitId,
          units.map((u) => u.id)
        )
      );

    const capsByUnit = new Map<string, string[]>();
    for (const c of allCaps) {
      const list = capsByUnit.get(c.unitId) ?? [];
      list.push(c.capabilityKey);
      capsByUnit.set(c.unitId, list);
    }

    return units.map((u) => ({
      ...u,
      capabilities: capsByUnit.get(u.id) ?? [],
    }));
  }

  async createUnit(
    eventId: string,
    data: CreateUnitRequest,
    actorUserId?: string,
    requestId?: string
  ) {
    await this.getEvent(eventId);

    const [existing] = await this.db
      .select({ id: organizationalUnits.id })
      .from(organizationalUnits)
      .where(
        and(
          eq(organizationalUnits.eventId, eventId),
          eq(organizationalUnits.slug, data.slug)
        )
      )
      .limit(1);

    if (existing) {
      throw new ConflictException(
        `Unit with slug '${data.slug}' already exists in this event`
      );
    }

    if (data.parentUnitId) {
      const [parent] = await this.db
        .select({ id: organizationalUnits.id })
        .from(organizationalUnits)
        .where(
          and(
            eq(organizationalUnits.id, data.parentUnitId),
            eq(organizationalUnits.eventId, eventId)
          )
        )
        .limit(1);

      if (!parent) {
        throw new BadRequestException('Parent unit does not exist in this event');
      }
    }

    const [created] = await this.db
      .insert(organizationalUnits)
      .values({
        eventId,
        parentUnitId: data.parentUnitId,
        name: data.name,
        slug: data.slug,
        kind: data.kind,
        description: data.description,
      })
      .returning();

    await this.auditService.record({
      action: 'unit.created',
      category: 'unit',
      eventId,
      resourceType: 'unit',
      resourceId: created!.id,
      actorUserId,
      requestId,
      metadata: {
        name: created!.name,
        slug: created!.slug,
        kind: created!.kind,
        parentUnitId: created!.parentUnitId,
      },
    });

    await this.searchIndexerService.emitSearchUpsert('unit', created!.id);

    return created;
  }

  async updateUnit(
    eventId: string,
    unitId: string,
    data: UpdateUnitRequest,
    actorUserId?: string,
    requestId?: string
  ) {
    const [unit] = await this.db
      .select()
      .from(organizationalUnits)
      .where(
        and(
          eq(organizationalUnits.id, unitId),
          eq(organizationalUnits.eventId, eventId)
        )
      )
      .limit(1);

    if (!unit) {
      throw new NotFoundException(`Unit '${unitId}' not found in event`);
    }

    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (data.name !== undefined && data.name !== unit.name) {
      updatePayload.name = data.name;
      changes.name = { from: unit.name, to: data.name };
    }
    if (data.slug !== undefined && data.slug !== unit.slug) {
      updatePayload.slug = data.slug;
      changes.slug = { from: unit.slug, to: data.slug };
    }
    if (data.kind !== undefined && data.kind !== unit.kind) {
      updatePayload.kind = data.kind;
      changes.kind = { from: unit.kind, to: data.kind };
    }
    if (data.description !== undefined && data.description !== unit.description) {
      updatePayload.description = data.description;
      changes.description = { from: unit.description, to: data.description };
    }
    if (data.parentUnitId !== undefined && data.parentUnitId !== unit.parentUnitId) {
      if (data.parentUnitId === unit.id) {
        throw new BadRequestException('A unit cannot be its own parent');
      }
      if (data.parentUnitId) {
        const [parent] = await this.db
          .select({ id: organizationalUnits.id, parentUnitId: organizationalUnits.parentUnitId })
          .from(organizationalUnits)
          .where(and(eq(organizationalUnits.id, data.parentUnitId), eq(organizationalUnits.eventId, eventId)))
          .limit(1);
        if (!parent) throw new BadRequestException('Parent unit does not exist in this event');
        let ancestorId = parent.parentUnitId;
        while (ancestorId) {
          if (ancestorId === unit.id) throw new BadRequestException('Moving this unit would create a hierarchy cycle');
          const [ancestor] = await this.db
            .select({ parentUnitId: organizationalUnits.parentUnitId })
            .from(organizationalUnits)
            .where(and(eq(organizationalUnits.id, ancestorId), eq(organizationalUnits.eventId, eventId)))
            .limit(1);
          ancestorId = ancestor?.parentUnitId ?? null;
        }
      }
      updatePayload.parentUnitId = data.parentUnitId;
      changes.parentUnitId = { from: unit.parentUnitId, to: data.parentUnitId };
    }
    if (data.archivedAt !== undefined) {
      const parsedArchived = data.archivedAt ? new Date(data.archivedAt) : null;
      updatePayload.archivedAt = parsedArchived;
      changes.archivedAt = { from: unit.archivedAt, to: parsedArchived };
    }

    const [updated] = await this.db
      .update(organizationalUnits)
      .set(updatePayload)
      .where(eq(organizationalUnits.id, unitId))
      .returning();

    const isArchived = data.archivedAt !== undefined;
    await this.auditService.record({
      action: isArchived ? 'unit.archived' : 'unit.updated',
      category: 'unit',
      eventId,
      resourceType: 'unit',
      resourceId: unitId,
      actorUserId,
      requestId,
      changes: Object.keys(changes).length > 0 ? changes : null,
    });

    await this.searchIndexerService.emitSearchUpsert('unit', unitId);

    return updated;
  }

  async assignMembershipToUnit(eventId: string, unitId: string, membershipId: string) {
    await this.getEvent(eventId);

    const [unit] = await this.db
      .select({ id: organizationalUnits.id })
      .from(organizationalUnits)
      .where(
        and(
          eq(organizationalUnits.id, unitId),
          eq(organizationalUnits.eventId, eventId)
        )
      )
      .limit(1);

    if (!unit) {
      throw new NotFoundException(`Unit '${unitId}' not found in this event`);
    }

    const [created] = await this.db
      .insert(membershipUnitAssignments)
      .values({
        membershipId,
        unitId,
      })
      .onConflictDoNothing()
      .returning();

    return created ?? { membershipId, unitId };
  }

  async getUnitCapabilities(eventId: string, unitId: string) {
    await this.getEvent(eventId);

    const [unit] = await this.db
      .select({ id: organizationalUnits.id })
      .from(organizationalUnits)
      .where(and(eq(organizationalUnits.id, unitId), eq(organizationalUnits.eventId, eventId)))
      .limit(1);

    if (!unit) {
      throw new NotFoundException(`Unit '${unitId}' not found in this event`);
    }

    const rows = await this.db
      .select()
      .from(unitCapabilities)
      .where(eq(unitCapabilities.unitId, unitId))
      .orderBy(unitCapabilities.capabilityKey);

    return rows.map((r) => ({
      id: r.id,
      unitId: r.unitId,
      capabilityKey: r.capabilityKey,
      configuration: r.configuration as Record<string, any> | null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async setUnitCapabilities(
    eventId: string,
    unitId: string,
    capabilityKeys: string[],
    actorUserId?: string,
    requestId?: string
  ) {
    await this.getEvent(eventId);

    const [unit] = await this.db
      .select({ id: organizationalUnits.id, name: organizationalUnits.name })
      .from(organizationalUnits)
      .where(and(eq(organizationalUnits.id, unitId), eq(organizationalUnits.eventId, eventId)))
      .limit(1);

    if (!unit) {
      throw new NotFoundException(`Unit '${unitId}' not found in this event`);
    }

    // Delete existing capabilities for this unit
    await this.db.delete(unitCapabilities).where(eq(unitCapabilities.unitId, unitId));

    // Deduplicate capability keys
    const uniqueKeys = Array.from(new Set(capabilityKeys.filter(Boolean)));

    if (uniqueKeys.length > 0) {
      await this.db.insert(unitCapabilities).values(
        uniqueKeys.map((key) => ({
          id: generateId(),
          unitId,
          capabilityKey: key,
          configuration: null,
        }))
      );
    }

    await this.auditService.record({
      action: 'unit.capabilities_updated',
      category: 'unit',
      eventId,
      resourceType: 'unit',
      resourceId: unitId,
      actorUserId,
      requestId,
      metadata: {
        unitName: unit.name,
        capabilities: uniqueKeys,
      },
    });

    return this.getUnitCapabilities(eventId, unitId);
  }

  // ============================================================================
  // Roles & Permissions
  // ============================================================================

  async listRoles(eventId: string) {
    await this.getEvent(eventId);

    const roleRows = await this.db
      .select()
      .from(roles)
      .where(eq(roles.eventId, eventId));

    return Promise.all(
      roleRows.map(async (r) => {
        const perms = await this.db
          .select({
            permissionKey: rolePermissions.permissionKey,
            scope: rolePermissions.scope,
          })
          .from(rolePermissions)
          .where(eq(rolePermissions.roleId, r.id));

        return {
          id: r.id,
          eventId: r.eventId,
          name: r.name,
          slug: r.slug,
          description: r.description,
          permissions: perms,
          createdAt: r.createdAt.toISOString(),
        };
      })
    );
  }

  private validateEventGrants(grants: CreateRoleRequest['permissions'] | undefined) {
    if (grants?.some(p => p.scope === PermissionScopes.PLATFORM || p.permissionKey === Permissions.PLATFORM_MANAGE)) {
      throw new BadRequestException('Event roles cannot grant platform authority');
    }
  }

  async createRole(
    eventId: string,
    data: CreateRoleRequest,
    actorUserId?: string,
    requestId?: string
  ) {
    await this.getEvent(eventId);

    this.validateEventGrants(data.permissions);
    const [createdRole] = await this.db
      .insert(roles)
      .values({
        eventId,
        name: data.name,
        slug: data.slug,
        description: data.description,
      })
      .returning();

    if (data.permissions && data.permissions.length > 0) {
      await this.db.insert(rolePermissions).values(
        data.permissions.map((p) => ({
          roleId: createdRole!.id,
          permissionKey: p.permissionKey,
          scope: p.scope,
        }))
      );
    }

    await this.auditService.record({
      action: 'role.created',
      category: 'role',
      eventId,
      resourceType: 'role',
      resourceId: createdRole!.id,
      actorUserId,
      requestId,
      metadata: {
        name: createdRole!.name,
        slug: createdRole!.slug,
        permissionCount: data.permissions?.length ?? 0,
      },
    });

    await this.searchIndexerService.emitSearchUpsert('role', createdRole!.id);

    return createdRole;
  }

  async updateRole(
    eventId: string,
    roleId: string,
    data: UpdateRoleRequest,
    actorUserId?: string,
    requestId?: string
  ) {
    this.validateEventGrants(data.permissions);
    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.eventId, eventId)))
      .limit(1);

    if (!role) {
      throw new NotFoundException(`Role '${roleId}' not found in event`);
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (data.name !== undefined && data.name !== role.name) {
      changes.name = { from: role.name, to: data.name };
    }
    if (data.description !== undefined && data.description !== role.description) {
      changes.description = { from: role.description, to: data.description };
    }

    if (data.name !== undefined || data.description !== undefined) {
      await this.db
        .update(roles)
        .set({
          name: data.name ?? role.name,
          description: data.description ?? role.description,
          updatedAt: new Date(),
        })
        .where(eq(roles.id, roleId));
    }

    if (data.permissions) {
      await this.db
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));

      if (data.permissions.length > 0) {
        await this.db.insert(rolePermissions).values(
          data.permissions.map((p) => ({
            roleId,
            permissionKey: p.permissionKey,
            scope: p.scope,
          }))
        );
      }
      changes.permissionsUpdated = { from: false, to: true };
    }

    await this.auditService.record({
      action: 'role.updated',
      category: 'role',
      eventId,
      resourceType: 'role',
      resourceId: roleId,
      actorUserId,
      requestId,
      changes: Object.keys(changes).length > 0 ? changes : null,
    });

    await this.searchIndexerService.emitSearchUpsert('role', roleId);

    return this.db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  }

  async assignRole(eventId: string, data: AssignRoleRequest, actorUserId?: string, requestId?: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.id, data.roleId), eq(roles.eventId, eventId)))
      .limit(1);

    if (!role) {
      throw new NotFoundException(`Role '${data.roleId}' not found`);
    }

    if (!data.membershipId || data.userId) {
      throw new BadRequestException('Event role must be assigned to an event membership, not a platform user');
    }
    const [member] = await this.db.select({id:eventMemberships.id}).from(eventMemberships).where(and(eq(eventMemberships.id,data.membershipId),eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'))).limit(1);
    if (!member) throw new BadRequestException('Active membership in this event is required');
    if (data.unitId) {
      const [unit] = await this.db.select({id:organizationalUnits.id}).from(organizationalUnits).where(and(eq(organizationalUnits.id,data.unitId),eq(organizationalUnits.eventId,eventId))).limit(1);
      if (!unit) throw new BadRequestException('Assignment unit must belong to this event');
    }
    const [assignment] = await this.db
      .insert(roleAssignments)
      .values({
        roleId: data.roleId,
        userId: data.userId,
        membershipId: data.membershipId,
        unitId: data.unitId,
      })
      .returning();

    await this.auditService.record({
      action: 'role.assigned',
      category: 'role',
      eventId: role.eventId,
      resourceType: 'role_assignment',
      resourceId: assignment!.id,
      actorUserId,
      requestId,
      metadata: {
        roleId: data.roleId,
        roleSlug: role.slug,
        userId: data.userId,
        membershipId: data.membershipId,
        unitId: data.unitId,
      },
    });

    return assignment;
  }
}
