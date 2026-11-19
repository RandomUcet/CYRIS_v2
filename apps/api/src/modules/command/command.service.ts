import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { MedicalService } from '../medical/medical.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { InvestigationService } from '../investigation/investigation.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  incidents,
  resources,
  activityEvents,
  operationalTasks,
  events,
  commandDefconStates,
  auditEvents,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import type {
  OperationalPictureResponse,
  CreateSitrepRequest,
  DocumentItem,
  CommandDefconSnapshot,
  ChangeCommandDefconRequest,
} from '@cyris/contracts';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { assertExpectedRevision, isConcurrentInitializationError } from './defcon-policy.js';

@Injectable()
export class CommandService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tasksService: TasksService,
    private readonly medicalService: MedicalService,
    private readonly documentsService: DocumentsService,
    private readonly investigationService: InvestigationService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly authorizationService: AuthorizationService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async getDefcon(eventId: string, user: AuthenticatedUser): Promise<CommandDefconSnapshot> {
    await this.assertEventPermission(eventId, user, Permissions.COMMAND_READ);
    const [state] = await this.db.select().from(commandDefconStates)
      .where(eq(commandDefconStates.eventId, eventId)).limit(1);
    const historyRows = await this.db.select({
      id: auditEvents.id,
      level: sql<number>`(${auditEvents.changes}->>'toLevel')::integer`,
      reason: sql<string>`(${auditEvents.metadata}->>'reason')`,
      occurredAt: auditEvents.occurredAt,
      actorUserId: auditEvents.actorUserId,
    }).from(auditEvents).where(and(
      eq(auditEvents.eventId, eventId),
      eq(auditEvents.action, 'command.defcon.changed'),
    )).orderBy(desc(auditEvents.occurredAt)).limit(20);

    return {
      eventId,
      level: state?.level && state.level >= 1 && state.level <= 5 ? state.level as 1 | 2 | 3 | 4 | 5 : null,
      initialized: Boolean(state),
      revision: state?.revision ?? 0,
      reason: state?.reason ?? null,
      updatedByUserId: state?.updatedByUserId ?? null,
      updatedAt: state?.updatedAt?.toISOString() ?? null,
      history: historyRows.filter((row) => row.level >= 1 && row.level <= 5 && typeof row.reason === 'string').map((row) => ({
        id: row.id,
        level: row.level as 1 | 2 | 3 | 4 | 5,
        reason: row.reason,
        occurredAt: row.occurredAt.toISOString(),
        actorUserId: row.actorUserId,
      })),
    };
  }

  async changeDefcon(eventId: string, dto: ChangeCommandDefconRequest, user: AuthenticatedUser): Promise<CommandDefconSnapshot> {
    await this.assertEventPermission(eventId, user, Permissions.COMMAND_DEFCON_CHANGE);
    const changedAt = new Date();
    await this.databaseService.client.transaction(async (tx) => {
      const [current] = await tx.select({ revision: commandDefconStates.revision })
        .from(commandDefconStates).where(eq(commandDefconStates.eventId, eventId)).limit(1);
      const revision = current?.revision ?? 0;
      assertExpectedRevision(dto.expectedRevision, revision);
      if (current) {
        const updated = await tx.update(commandDefconStates).set({
          level: dto.level, revision: revision + 1, reason: dto.reason,
          updatedByUserId: user.id, updatedAt: changedAt,
        }).where(and(
          eq(commandDefconStates.eventId, eventId),
          eq(commandDefconStates.revision, dto.expectedRevision),
        )).returning({ eventId: commandDefconStates.eventId });
        if (updated.length !== 1) throw new ConflictException('DEFCON state changed concurrently');
      } else {
        try {
          await tx.insert(commandDefconStates).values({
            eventId, level: dto.level, revision: 1, reason: dto.reason,
            updatedByUserId: user.id, updatedAt: changedAt,
          });
        } catch (error) {
          if (isConcurrentInitializationError(error)) {
            throw new ConflictException('DEFCON state was initialized concurrently');
          }
          throw error;
        }
      }
      await this.auditService.record({
        action: 'command.defcon.changed', category: 'command', eventId,
        resourceType: 'command_defcon', resourceId: eventId, actorUserId: user.id,
        metadata: { reason: dto.reason },
        changes: { fromRevision: revision, toRevision: revision + 1, toLevel: dto.level },
        txClient: tx,
      });
    });
    return this.getDefcon(eventId, user);
  }

  private async assertEventPermission(
    eventId: string,
    user: AuthenticatedUser,
    permission: typeof Permissions.COMMAND_READ | typeof Permissions.COMMAND_DEFCON_CHANGE,
  ): Promise<void> {
    const [event] = await this.db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new NotFoundException(`Event '${eventId}' not found`);
    const allowed = await this.authorizationService.authorize({ user, permission, context: { eventId } });
    if (!allowed) throw new ForbiddenException(`Forbidden: Missing permission '${permission}'`);
  }

  /**
   * Builds the real-time operational picture from canonical system records.
   * STRICT: Composes actual database rows (no fabricated metrics or fake counters).
   */
  async getOperationalPicture(
    eventId: string,
    user: AuthenticatedUser
  ): Promise<OperationalPictureResponse> {
    // 1. Fetch High/Critical active incidents accessible to user
    const allIncidents = await this.investigationService.listIncidents(eventId, user);
    const criticalIncidents = allIncidents.filter(
      (inc) =>
        (inc.priority === 'HIGH' || inc.priority === 'CRITICAL') &&
        inc.status !== 'CLOSED' &&
        inc.status !== 'RESOLVED'
    );

    // 2. Fetch Priority operational tasks (In Progress, Blocked, or High/Urgent)
    const allTasks = await this.tasksService.listTasks(eventId, { page: 1, limit: 100 }, user);
    const priorityTasks = allTasks.filter(
      (t) =>
        t.status === 'IN_PROGRESS' ||
        t.status === 'BLOCKED' ||
        t.priority === 'HIGH' ||
        t.priority === 'URGENT'
    );

    // 3. Fetch recent significant activity events
    const recentActivitiesRows = await this.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.eventId, eventId))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(15);

    const recentActivities = recentActivitiesRows.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      occurredAt: a.occurredAt.toISOString(),
      title: a.title,
      summary: a.summary || undefined,
      actorUserId: a.actorUserId,
    }));

    // 4. Fetch Operational Medical Summary (Sanitized counts, zero patient identities)
    let medicalSummary = null;
    try {
      medicalSummary = await this.medicalService.getOperationalSummary(eventId, user);
    } catch {
      // If medical service is unavailable or event has no medical data, default to null
      medicalSummary = null;
    }

    return {
      eventId,
      criticalIncidents,
      priorityTasks,
      recentActivities,
      medicalSummary,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generates a formal Situation Report (SITREP) stored in Documents infrastructure.
   * Does NOT duplicate domain records; stores structured Markdown referencing canonical IDs.
   */
  async createSitrep(
    eventId: string,
    dto: CreateSitrepRequest,
    user: AuthenticatedUser
  ): Promise<DocumentItem> {
    const [eventRow] = await this.db
      .select({ name: events.name })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!eventRow) {
      throw new NotFoundException(`Event '${eventId}' not found`);
    }

    // Compose Markdown Content
    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const lines: string[] = [
      `# SITUATION REPORT (SITREP): ${dto.title.toUpperCase()}`,
      `**Event**: ${eventRow.name} (${eventId})`,
      `**Generated At**: ${now.toUTCString()}`,
      `**Compiled By**: ${user.displayName} (${user.email})`,
      `\n## Executive Summary\n${dto.summary}`,
    ];

    if (dto.incidentIds && dto.incidentIds.length > 0) {
      lines.push('\n## Associated Key Incidents');
      for (const incId of dto.incidentIds) {
        try {
          const inc = await this.investigationService.getIncident(eventId, incId, user);
          lines.push(`- **${inc.incidentNumber}**: ${inc.title} [Status: ${inc.status} | Priority: ${inc.priority}]`);
        } catch {
          lines.push(`- **Incident ${incId}**`);
        }
      }
    }

    if (dto.taskIds && dto.taskIds.length > 0) {
      lines.push('\n## Active Operational Tasks');
      for (const taskId of dto.taskIds) {
        try {
          const task = await this.tasksService.getTaskDetail(taskId, user);
          lines.push(`- **${task.taskNumber}**: ${task.title} [Status: ${task.status} | Assigned: ${task.assignedUnitName || 'Unassigned'}]`);
        } catch {
          lines.push(`- **Task ${taskId}**`);
        }
      }
    }

    if (dto.includeMedicalSummary) {
      try {
        const med = await this.medicalService.getOperationalSummary(eventId, user);
        lines.push('\n## Casualty & Medical Status');
        lines.push(`- Active Casualties under care: **${med.activeCasualties}**`);
        lines.push(`- Casualties Stabilized: **${med.stabilizedCasualties}**`);
        lines.push(`- Casualties Transferred to higher echelon: **${med.transferredCasualties}**`);
        lines.push(`- Closed / Discharged: **${med.closedCasualties}**`);
        lines.push(`- Triage Breakdown: Immediate: ${med.triageCounts.IMMEDIATE}, Delayed: ${med.triageCounts.DELAYED}, Minor: ${med.triageCounts.MINOR}`);
      } catch {
        // omit medical if not accessible
      }
    }

    lines.push('\n---\n*Recorded via CYRIS v2 Crisis Management Framework. Output classification is DRAFT until officially countersigned.*');

    const markdownText = lines.join('\n');
    const buffer = Buffer.from(markdownText, 'utf-8');

    // Upload via Documents Service as first-class document with type SITREP
    const doc = await this.documentsService.uploadDocument(
      eventId,
      {
        filename: `sitrep_${timestampStr}.md`,
        mimeType: 'text/markdown',
        data: buffer,
      },
      {
        title: dto.title,
        documentType: 'SITREP',
        description: dto.summary.slice(0, 500),
        visibility: dto.visibility || 'EVENT',
      },
      user
    );

    // Audit
    await this.auditService.record({
      action: 'command.sitrep.created',
      category: 'command',
      eventId,
      resourceType: 'document',
      resourceId: doc.id,
      actorUserId: user.id,
      metadata: {
        documentNumber: doc.documentNumber,
        title: dto.title,
        byteSize: buffer.length,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId,
      resourceId: doc.id,
      activityType: 'command.sitrep.created',
      actorUserId: user.id,
      title: `SITREP Issued: ${doc.documentNumber || doc.title}`,
      summary: dto.summary.slice(0, 200),
    });

    return doc;
  }
}
