import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  courtCases, courtRequests, courtRequestUpdates, membershipUnitAssignments, eventMemberships, organizationalUnits,
  resources, MembershipStatus, roleAssignments, rolePermissions, roles, notifications
} from '@cyris/db';
import { generateId, Permissions, PermissionScopes, type PermissionKey } from '@cyris/shared';
import type { CourtRequestItem, CourtRequestUpdate, CreateCourtRequest, ReplyCourtRequest } from '@cyris/contracts';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class CourtRequestsService {
  constructor(private readonly database: DatabaseService,
    private readonly authz: AuthorizationService,
    private readonly access: ResourceAccessService,
    private readonly audit: AuditService) {}
  private get db() { return this.database.client; }

  private async assertCase(eventId: string, courtCaseId: string, user: AuthenticatedUser) {
    const [court] = await this.db.select({ id: courtCases.id, eventId: courtCases.eventId,
      status: courtCases.status }).from(courtCases)
      .where(and(eq(courtCases.id, courtCaseId), eq(courtCases.eventId, eventId))).limit(1);
    if (!court) throw new NotFoundException('Legal matter not found in this exercise');
    await this.access.assertCanAccessResource(user, courtCaseId, Permissions.COURT_READ);
    return court;
  }
  private async assertPermission(eventId: string, user: AuthenticatedUser, permission: PermissionKey) {
    await this.authz.assertAuthorized({ user, permission, context: { eventId } });
  }
  private view(row: typeof courtRequests.$inferSelect): CourtRequestItem {
    return {
      id: row.id, eventId: row.eventId, courtCaseId: row.courtCaseId,
      kind: row.kind as CourtRequestItem['kind'], subject: row.subject, details: row.details,
      requestedFromUnitId: row.requestedFromUnitId, requestedByUserId: row.requestedByUserId,
      status: row.status as CourtRequestItem['status'], revision: row.revision,
      dueAt: row.dueAt?.toISOString() ?? null,
      response: row.response, linkedResourceId: row.linkedResourceId,
      respondedByUserId: row.respondedByUserId, respondedAt: row.respondedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      history: [],
    };
  }


  private viewUpdate(row: typeof courtRequestUpdates.$inferSelect): CourtRequestUpdate {
    return {
      id: row.id, requestId: row.requestId, revision: row.revision,
      status: row.status as CourtRequestUpdate['status'], response: row.response,
      linkedResourceId: row.linkedResourceId, actorUserId: row.actorUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Attach only authorized request histories, in one bounded database query. */
  private async withHistory(rows: CourtRequestItem[]): Promise<CourtRequestItem[]> {
    if (rows.length === 0) return rows;
    const updates = await this.db.select().from(courtRequestUpdates)
      .where(inArray(courtRequestUpdates.requestId, rows.map(row => row.id)))
      .orderBy(asc(courtRequestUpdates.revision));
    const byId = new Map<string, CourtRequestUpdate[]>();
    for (const row of updates) {
      const history = byId.get(row.requestId) ?? [];
      history.push(this.viewUpdate(row));
      byId.set(row.requestId, history);
    }
    return rows.map(row => ({ ...row, history: byId.get(row.id) ?? [] }));
  }

  private async visibleRequests(eventId: string, user: AuthenticatedUser,
    rows: (typeof courtRequests.$inferSelect)[]) {
    const isAdministrator = await this.authz.authorize({ user, permission: Permissions.PLATFORM_MANAGE });
    const isLegalRequester = await this.authz.authorize({
      user, permission: Permissions.COURT_REQUEST_CREATE, context: { eventId },
    });
    const memberships = await this.db.select({ unitId: membershipUnitAssignments.unitId })
      .from(eventMemberships).innerJoin(membershipUnitAssignments,
        eq(membershipUnitAssignments.membershipId, eventMemberships.id))
      .where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.userId,user.id),
        eq(eventMemberships.status,MembershipStatus.ACTIVE)));
    const unitIds = new Set(memberships.map(x=>x.unitId));
    const accessible = [];
    for (const row of rows) {
      const canSeeRecipient = isAdministrator || isLegalRequester ||
        row.requestedByUserId === user.id ||
        !row.requestedFromUnitId || unitIds.has(row.requestedFromUnitId);
      if (canSeeRecipient && await this.access.canAccessResource(user,row.courtCaseId,Permissions.COURT_READ)) {
        accessible.push(this.view(row));
      }
    }
    return this.withHistory(accessible);
  }
  async listEvent(eventId: string, user: AuthenticatedUser): Promise<CourtRequestItem[]> {
    await this.assertPermission(eventId,user,Permissions.COURT_REQUEST_READ);
    const rows = await this.db.select().from(courtRequests).where(eq(courtRequests.eventId,eventId))
      .orderBy(desc(courtRequests.createdAt)).limit(300);
    return this.visibleRequests(eventId,user,rows);
  }

  async list(eventId: string, courtCaseId: string, user: AuthenticatedUser): Promise<CourtRequestItem[]> {
    await this.assertCase(eventId, courtCaseId, user);
    await this.assertPermission(eventId, user, Permissions.COURT_REQUEST_READ);
    const records = await this.db.select().from(courtRequests)
      .where(and(eq(courtRequests.eventId, eventId), eq(courtRequests.courtCaseId, courtCaseId)))
      .orderBy(desc(courtRequests.createdAt)).limit(300);
    return this.visibleRequests(eventId,user,records);
  }

  async create(eventId: string, courtCaseId: string, input: CreateCourtRequest, user: AuthenticatedUser) {
    const court = await this.assertCase(eventId, courtCaseId, user);
    await this.assertPermission(eventId, user, Permissions.COURT_REQUEST_CREATE);
    if (court.status === 'CLOSED') throw new ConflictException('Closed legal matters cannot accept requests');
    if (input.requestedFromUnitId) {
      const [unit] = await this.db.select({ id: organizationalUnits.id }).from(organizationalUnits)
        .where(and(eq(organizationalUnits.id, input.requestedFromUnitId),
          eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt))).limit(1);
      if (!unit) throw new BadRequestException('Receiving team must belong to this exercise');
    }
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && dueAt <= new Date()) throw new BadRequestException('Deadline must be in the future');
    return this.db.transaction(async tx => {
      const [created] = await tx.insert(courtRequests).values({
        id: generateId(), eventId, courtCaseId,
        kind: input.kind, subject: input.subject, details: input.details,
        requestedByUserId: user.id, requestedFromUnitId: input.requestedFromUnitId ?? null, dueAt,
      }).returning();
      await this.audit.record({
        action: 'court.request.created', category: 'court', eventId, actorUserId: user.id,
        resourceType: 'court_request', resourceId: created!.id,
        metadata: { courtCaseId, kind: input.kind, requestedFromUnitId: input.requestedFromUnitId ?? null },
        txClient: tx,
      });
      // Notification contains NO freeform case text or classified evidence metadata.
      // A unit-targeted request should appear in eligible active responders' in-app queues.
      if (input.requestedFromUnitId) {
        const eligible = await tx.selectDistinct({ userId: eventMemberships.userId })
          .from(eventMemberships)
          .innerJoin(membershipUnitAssignments,
            eq(membershipUnitAssignments.membershipId, eventMemberships.id))
          .innerJoin(roleAssignments,
            eq(roleAssignments.membershipId, eventMemberships.id))
          .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
          .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
          .where(and(
            eq(eventMemberships.eventId, eventId),
            eq(eventMemberships.status, MembershipStatus.ACTIVE),
            eq(membershipUnitAssignments.unitId, input.requestedFromUnitId),
            eq(roles.eventId, eventId),
            eq(rolePermissions.permissionKey, Permissions.COURT_REQUEST_RESPOND),
            eq(rolePermissions.scope, PermissionScopes.EVENT),
            or(isNull(roleAssignments.unitId), eq(roleAssignments.unitId, input.requestedFromUnitId)),
          ));
        const recipients = eligible.filter(row => row.userId !== user.id);
        if (recipients.length) {
          await tx.insert(notifications).values(recipients
            .map(row => ({
              id: generateId(), userId: row.userId, eventId, type: 'COURT_REQUEST_CREATED',
              severity: 'ACTION', templateKey: 'court.request.created',
              templateParams: {}, resourceId: courtCaseId,
              actionUrl: '/events/' + eventId + '/court/' + courtCaseId + '?tab=requests',
              sourceEventId: created!.id,
            }))).onConflictDoNothing();
        }
      }
      return this.view(created!);
    });
  }

  async reply(eventId: string, courtCaseId: string, requestId: string,
    input: ReplyCourtRequest, user: AuthenticatedUser): Promise<CourtRequestItem> {
    await this.assertCase(eventId, courtCaseId, user);
    await this.assertPermission(eventId, user, Permissions.COURT_REQUEST_RESPOND);
    const [request] = await this.db.select().from(courtRequests).where(and(
      eq(courtRequests.id, requestId), eq(courtRequests.courtCaseId, courtCaseId),
      eq(courtRequests.eventId, eventId),
    )).limit(1);
    if (!request) throw new NotFoundException('Legal request not found');
    if (request.requestedFromUnitId && !(await this.authz.authorize({
      user, permission: Permissions.PLATFORM_MANAGE,
    }))) {
      const [membership] = await this.db.select({ unitId: membershipUnitAssignments.unitId })
        .from(eventMemberships).innerJoin(membershipUnitAssignments,
          eq(membershipUnitAssignments.membershipId, eventMemberships.id))
        .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id),
          eq(eventMemberships.status, MembershipStatus.ACTIVE),
          eq(membershipUnitAssignments.unitId, request.requestedFromUnitId))).limit(1);
      if (!membership) throw new ForbiddenException('Only the addressed team can respond');
    }
    if (input.linkedResourceId) {
      const [linked] = await this.db.select({ eventId: resources.eventId,
        type: resources.resourceType }).from(resources)
        .where(eq(resources.id, input.linkedResourceId)).limit(1);
      if (!linked || linked.eventId !== eventId) throw new BadRequestException('Linked record belongs to another exercise');
      const permissionByType: Record<string, PermissionKey> = {
        evidence: Permissions.EVIDENCE_READ, document: Permissions.DOCUMENT_READ,
        lab_analysis: Permissions.LAB_READ, forensic_analysis: Permissions.FORENSICS_READ,
        medical_encounter: Permissions.MEDICAL_READ,
      };
      const required = permissionByType[linked.type];
      if (!required || !(await this.access.canAccessResource(user, input.linkedResourceId, required))) {
        throw new ForbiddenException('Cannot disclose a record without permission to view it');
      }
    }
    const updatedRow = await this.db.transaction(async tx => {
      const [updated] = await tx.update(courtRequests).set({
        status: input.status, response: input.response,
        linkedResourceId: input.linkedResourceId ?? null,
        respondedByUserId: user.id, respondedAt: new Date(),
        revision: input.expectedRevision + 1, updatedAt: new Date(),
      }).where(and(eq(courtRequests.id, requestId), eq(courtRequests.eventId, eventId),
        eq(courtRequests.courtCaseId, courtCaseId), eq(courtRequests.revision, input.expectedRevision),
        // Requests may be amended while pending, never after final delivery.
        inArray(courtRequests.status, ['OPEN', 'IN_PROGRESS']),
      )).returning();
      if (!updated) throw new ConflictException('Request changed or was already answered; refresh before responding');
      await tx.insert(courtRequestUpdates).values({
        id: generateId(), requestId, revision: input.expectedRevision + 1,
        status: input.status, response: input.response, linkedResourceId: input.linkedResourceId ?? null,
        actorUserId: user.id,
      });
      await this.audit.record({
        action: 'court.request.responded', category: 'court', eventId, actorUserId: user.id,
        resourceType: 'court_request', resourceId: requestId,
        metadata: { status: input.status, courtCaseId, linkedResourceId: input.linkedResourceId ?? null },
        txClient: tx,
      });
      // Tell the request author that the addressed team answered. In-app only;
      // sensitive medical/forensic content must never leak through an email preview.
      if (request.requestedByUserId !== user.id) {
        await tx.insert(notifications).values({
          id: generateId(), userId: request.requestedByUserId, eventId,
          type: 'COURT_REQUEST_RESPONDED', severity: 'ACTION',
          templateKey: 'court.request.responded', templateParams: {},
          resourceId: courtCaseId,
          actionUrl: '/events/' + eventId + '/court/' + courtCaseId + '?tab=requests',
          sourceEventId: requestId + ':' + (input.expectedRevision + 1),
        }).onConflictDoNothing();
      }
      return updated;
    });
    return (await this.withHistory([this.view(updatedRow)]))[0]!;
  }
}
