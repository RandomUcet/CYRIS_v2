import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc, inArray, sql, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  operationalTasks,
  resources,
  type ResourceVisibilityValue,
  users,
  organizationalUnits,
  eventMemberships,
  resourceRelationships,
  labAnalyses,
  membershipUnitAssignments,
  MembershipStatus,
  UserStatus,
} from '@cyris/db';
import { generateId, Permissions, type PermissionKey } from '@cyris/shared';
import type {
  OperationalTaskItem,
  OperationalTaskDetail,
  TaskAction,
  CreateOperationalTaskRequest,
  UpdateOperationalTaskRequest,
  AssignOperationalTaskRequest,
  AcknowledgeOperationalTaskRequest,
  StartOperationalTaskRequest,
  BlockOperationalTaskRequest,
  CompleteOperationalTaskRequest,
  CancelOperationalTaskRequest,
  ReopenOperationalTaskRequest,
  TaskQueryFilters,
  MyWorkQuery,
  MyWorkResponse,
  MyWorkItem,
} from '@cyris/contracts';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { isActionableMyWorkItem, isMyWorkViewAllowed, sortAndPaginateMyWork } from './my-work.js';
import { DisruptionsService } from '../disruptions/disruptions.service.js';

@Injectable()
export class TasksService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly identifierAllocator: IdentifierAllocatorService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly searchIndexer: SearchIndexerService,
    private readonly notificationsService: NotificationsService,
    private readonly authorizationService: AuthorizationService,
    private readonly disruptionsService: DisruptionsService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Creates a new operational task.
   * Registered as a first-class event resource (resources.id === operational_tasks.id).
   */
  async createTask(
    eventId: string,
    dto: CreateOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskItem> {
    await this.authorizationService.assertAuthorized({
      user, permission: Permissions.TASK_CREATE,
      context: { eventId, unitId: dto.owningUnitId || dto.assignedUnitId },
    });
    await this.validateAssignmentTargets(eventId, dto.owningUnitId);
    if (dto.assignedUnitId || dto.assignedUserId) {
      await this.authorizationService.assertAuthorized({
        user, permission: Permissions.TASK_ASSIGN,
        context: { eventId, unitId: dto.assignedUnitId },
      });
    }
    if (dto.sourceResourceId && !await this.canReadLinkedResource(eventId, dto.sourceResourceId, user)) {
      throw new ForbiddenException('Source resource is not accessible in this exercise');
    }
    await this.disruptionsService.assertTaskWriteAllowed(eventId, user, dto.assignedUnitId);
    await this.validateAssignmentTargets(eventId, dto.assignedUnitId, dto.assignedUserId);
    const taskId = generateId();

    const result = await this.db.transaction(async (tx) => {
      // 1. Concurrency-safe identifier allocation: TASK-0001
      const taskNumber = await this.identifierAllocator.allocate(
        eventId,
        'TASK',
        'TASK',
        tx
      );

      // 2. Base resource registration
      await this.resourceService.registerResource(eventId, 'operational_task', {
        id: taskId,
        visibility: dto.visibility as ResourceVisibilityValue,
        owningUnitId: dto.owningUnitId || dto.assignedUnitId || null,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 3. Insert domain operational task
      const [created] = await tx
        .insert(operationalTasks)
        .values({
          id: taskId,
          eventId,
          taskNumber,
          title: dto.title,
          description: dto.description || null,
          status: 'OPEN',
          priority: dto.priority || 'NORMAL',
          owningUnitId: dto.owningUnitId || dto.assignedUnitId || null,
          assignedUnitId: dto.assignedUnitId || null,
          assignedUserId: dto.assignedUserId || null,
          sourceType: dto.sourceType || 'MANUAL',
          sourceResourceId: dto.sourceResourceId || null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          createdByUserId: user.id,
        })
        .returning();

      // 4. Link relationship to source if specified
      if (dto.sourceResourceId) {
        await this.resourceService.createRelationship({
          eventId,
          sourceResourceId: dto.sourceResourceId,
          targetResourceId: taskId,
          relationshipType: 'GENERATED_TASK',
          createdByUserId: user.id,
          metadata: { taskNumber },
          txClient: tx,
        });
      }

      // 5. Audit
      await this.auditService.record({
        action: 'task.created',
        category: 'tasks',
        eventId,
        resourceType: 'operational_task',
        resourceId: taskId,
        actorUserId: user.id,
        metadata: {
          taskNumber,
          title: dto.title,
          priority: dto.priority,
          assignedUnitId: dto.assignedUnitId,
          sourceType: dto.sourceType,
          sourceResourceId: dto.sourceResourceId,
        },
        txClient: tx,
      });

      // 6. Activity Timeline
      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: taskId,
          activityType: 'task.created',
          actorUserId: user.id,
          title: `Task Created: ${taskNumber} — ${dto.title}`,
          summary: `Priority: ${dto.priority || 'NORMAL'} | Source: ${dto.sourceType || 'MANUAL'}`,
        },
        tx
      );

      // 7. Search index outbox event
      await this.searchIndexer.emitSearchUpsert('operational_task', taskId, tx);


      return this.mapTaskItem(created!, {
        visibility: dto.visibility,
        ownerUserId: user.id,
      });
    });

    if (dto.assignedUserId) {
      await this.notificationsService.emit({
        userId: dto.assignedUserId,
        eventId,
        type: 'TASK_ASSIGNED',
        severity: 'ACTION',
        templateKey: 'task.assigned',
        templateParams: {
          taskNumber: result.taskNumber,
          title: dto.title,
        },
        resourceId: taskId,
        actionUrl: `/events/${eventId}/tasks/${taskId}`,
        sourceEventId: `task-assign-${taskId}-${dto.assignedUserId}`,
      });
    }
    return result;
  }

  async updateTask(taskId: string, dto: UpdateOperationalTaskRequest, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    return this.mutateTask(taskId, user, expectedEventId, Permissions.TASK_UPDATE, async () => ({
      action: 'task.updated',
      updates: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
      },
      metadata: { fields: Object.keys(dto) },
    }));
  }

  async assignTask(taskId: string, dto: AssignOperationalTaskRequest, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    let changed = false;
    const result = await this.mutateTask(taskId, user, expectedEventId, Permissions.TASK_ASSIGN, async (existing) => {
      await this.validateAssignmentTargets(existing.eventId, dto.assignedUnitId, dto.assignedUserId);
      if (dto.assignedUnitId || dto.assignedUserId) {
        await this.authorizationService.assertAuthorized({ user, permission: Permissions.TASK_ASSIGN,
          context: { eventId: existing.eventId, unitId: dto.assignedUnitId ?? undefined } });
      }
      const assignedUnitId = dto.assignedUnitId ?? null;
      const assignedUserId = dto.assignedUserId ?? null;
      changed = existing.assignedUnitId !== assignedUnitId || existing.assignedUserId !== assignedUserId;
      return {
        action: 'task.assigned', noOp: !changed,
        updates: { assignedUnitId, assignedUserId },
        title: `Task Assigned: ${existing.taskNumber}`, summary: dto.notes,
        metadata: { assignedUnitId, assignedUserId, notes: dto.notes },
      };
    });
    if (changed && dto.assignedUserId) {
      await this.notificationsService.emit({
        userId: dto.assignedUserId, eventId: result.eventId, type: 'TASK_ASSIGNED', severity: 'ACTION',
        templateKey: 'task.assigned', templateParams: { taskNumber: result.taskNumber, title: result.title },
        resourceId: taskId, actionUrl: `/events/${result.eventId}/tasks/${taskId}`,
        sourceEventId: `task-assign-${taskId}-${dto.assignedUserId}-${result.updatedAt}`,
      });
    }
    return result;
  }

  async acknowledgeTask(taskId: string, dto: AcknowledgeOperationalTaskRequest, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    return this.mutateTask(taskId, user, expectedEventId, Permissions.TASK_ACKNOWLEDGE, async (existing) => {
      this.assertTaskActive(existing, 'acknowledge');
      return { action: 'task.acknowledged', noOp: existing.status !== 'OPEN',
        updates: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
        title: `Task Acknowledged: ${existing.taskNumber}`, summary: dto.notes,
        metadata: { notes: dto.notes } };
    });
  }

  async startTask(taskId: string, dto: StartOperationalTaskRequest, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    return this.mutateTask(taskId, user, expectedEventId, Permissions.TASK_WORK, async (existing) => {
      this.assertTaskActive(existing, 'start');
      return { action: 'task.started', noOp: existing.status === 'IN_PROGRESS',
        updates: { status: 'IN_PROGRESS', startedAt: existing.startedAt ?? new Date(), blockedReason: null },
        title: `Task In Progress: ${existing.taskNumber}`, summary: dto.notes,
        metadata: { notes: dto.notes } };
    });
  }

  async blockTask(taskId: string, dto: BlockOperationalTaskRequest, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    return this.mutateTask(taskId, user, expectedEventId, Permissions.TASK_WORK, async (existing) => {
      this.assertTaskActive(existing, 'block');
      return { action: 'task.blocked', noOp: existing.status === 'BLOCKED' && existing.blockedReason === dto.reason,
        updates: { status: 'BLOCKED', blockedReason: dto.reason },
        title: `Task Blocked: ${existing.taskNumber}`, summary: dto.reason,
        metadata: { reason: dto.reason } };
    });
  }

  async completeTask(taskId: string, dto: CompleteOperationalTaskRequest, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    return this.mutateTask(taskId, user, expectedEventId, Permissions.TASK_COMPLETE, async (existing) => {
      if (existing.status === 'CANCELLED') throw new BadRequestException('Cannot complete a cancelled task. Reopen it first.');
      return { action: 'task.completed', noOp: existing.status === 'COMPLETED',
        updates: { status: 'COMPLETED', completedAt: new Date(), completionNote: dto.completionNote ?? null, blockedReason: null },
        title: `Task Completed: ${existing.taskNumber}`, summary: dto.completionNote,
        metadata: { note: dto.completionNote } };
    });
  }

  async cancelTask(taskId: string, dto: CancelOperationalTaskRequest, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    return this.mutateTask(taskId, user, expectedEventId, Permissions.TASK_CANCEL, async (existing) => {
      if (existing.status === 'COMPLETED') throw new BadRequestException('Cannot cancel a completed task. Reopen it first.');
      return { action: 'task.cancelled', noOp: existing.status === 'CANCELLED',
        updates: { status: 'CANCELLED', blockedReason: dto.reason },
        title: `Task Cancelled: ${existing.taskNumber}`, summary: dto.reason,
        metadata: { reason: dto.reason } };
    });
  }

  async reopenTask(taskId: string, dto: ReopenOperationalTaskRequest, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    return this.mutateTask(taskId, user, expectedEventId, Permissions.TASK_UPDATE, async (existing) => {
      if (!['COMPLETED', 'CANCELLED'].includes(existing.status)) throw new BadRequestException('Only a completed or cancelled task can be reopened');
      return { action: 'task.reopened',
        updates: { status: dto.newStatus ?? 'OPEN', completedAt: null, completionNote: null, blockedReason: null },
        title: `Task Reopened: ${existing.taskNumber}`, summary: dto.reason,
        metadata: { reason: dto.reason } };
    });
  }

  private assertTaskActive(task: typeof operationalTasks.$inferSelect, action: string): void {
    if (['COMPLETED', 'CANCELLED'].includes(task.status)) {
      throw new BadRequestException(`Cannot ${action} task in ${task.status} status. Reopen it first.`);
    }
  }

  /** Serialize each task transition and atomically persist state, audit and outbox.
   * Retried acknowledgement/start/completion does not regress state or duplicate audit.
   */
  private async mutateTask(
    taskId: string,
    user: AuthenticatedUser,
    expectedEventId: string | undefined,
    permission: PermissionKey,
    buildChange: (task: typeof operationalTasks.$inferSelect) => Promise<{
      action: string;
      updates: Partial<typeof operationalTasks.$inferInsert>;
      noOp?: boolean;
      title?: string;
      summary?: string | null;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<OperationalTaskDetail> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(operationalTasks)
        .where(and(eq(operationalTasks.id, taskId), expectedEventId ? eq(operationalTasks.eventId, expectedEventId) : undefined))
        .limit(1).for('update');
      if (!existing) throw new NotFoundException(`Task '${taskId}' not found in this event`);
      await this.resourceAccessService.assertCanAccessResource(user, taskId, permission, tx);
      await this.disruptionsService.assertTaskWriteAllowed(existing.eventId, user, existing.assignedUnitId);
      const change = await buildChange(existing);
      if (change.noOp) return;
      const now = new Date();
      await tx.update(operationalTasks).set({ ...change.updates, updatedAt: now })
        .where(and(eq(operationalTasks.id, taskId), eq(operationalTasks.eventId, existing.eventId)));
      await this.auditService.record({
        action: change.action, category: 'tasks', eventId: existing.eventId,
        resourceType: 'operational_task', resourceId: taskId, actorUserId: user.id,
        metadata: { taskNumber: existing.taskNumber, ...change.metadata },
        changes: { previousStatus: existing.status, newStatus: change.updates.status ?? existing.status },
        txClient: tx,
      });
      if (change.title) await this.activityService.recordActivity({
        eventId: existing.eventId, resourceId: taskId, activityType: change.action,
        actorUserId: user.id, title: change.title, summary: change.summary,
      }, tx);
      await this.searchIndexer.emitSearchUpsert('operational_task', taskId, tx);
    });
    return this.getTaskDetail(taskId, user, expectedEventId);
  }

  /**
   * Retrieves single task detail with relationships and access check.
   */
  async getTaskDetail(taskId: string, user: AuthenticatedUser, expectedEventId?: string): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_READ
    );

    const [row] = await this.db
      .select({
        task: operationalTasks,
        resource: resources,
        owningUnit: organizationalUnits,
        createdByUser: users,
      })
      .from(operationalTasks)
      .innerJoin(resources, eq(operationalTasks.id, resources.id))
      .leftJoin(organizationalUnits, eq(operationalTasks.owningUnitId, organizationalUnits.id))
      .leftJoin(users, eq(operationalTasks.createdByUserId, users.id))
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }
    if (expectedEventId && row.task.eventId !== expectedEventId) {
      throw new NotFoundException(`Task '${taskId}' not found in this event`);
    }
    await this.disruptionsService.assertTaskReadAllowed(row.task.eventId, user, row.task.assignedUnitId);

    // Resolve assigned unit/user labels
    let assignedUnitName: string | undefined;
    if (row.task.assignedUnitId) {
      const [u] = await this.db
        .select({ name: organizationalUnits.name })
        .from(organizationalUnits)
        .where(eq(organizationalUnits.id, row.task.assignedUnitId))
        .limit(1);
      assignedUnitName = u?.name;
    }

    let assignedUserDisplayName: string | undefined;
    if (row.task.assignedUserId) {
      const [u] = await this.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, row.task.assignedUserId))
        .limit(1);
      assignedUserDisplayName = u?.displayName;
    }

    // Resolve source resource if any
    let sourceResource: { id: string; resourceType: string; title?: string } | null = null;
    if (row.task.sourceResourceId && await this.canReadLinkedResource(row.task.eventId, row.task.sourceResourceId, user)) {
      const [s] = await this.db
        .select({ id: resources.id, resourceType: resources.resourceType })
        .from(resources)
        .where(eq(resources.id, row.task.sourceResourceId))
        .limit(1);
      if (s) {
        sourceResource = s;
      }
    }

    // Related resources
    const relations = await this.db
      .select({
        rel: resourceRelationships,
        targetResource: resources,
      })
      .from(resourceRelationships)
      .innerJoin(resources, eq(resourceRelationships.targetResourceId, resources.id))
      .where(and(eq(resourceRelationships.sourceResourceId, taskId), isNull(resourceRelationships.removedAt), eq(resources.eventId, row.task.eventId)));

    const visibleRelations = [];
    for (const relation of relations) {
      if (await this.canReadLinkedResource(row.task.eventId, relation.targetResource.id, user)) {
        visibleRelations.push(relation);
      }
    }
    return {
      availableActions: await this.availableActions(row.task, user),
      ...this.mapTaskItem(row.task, {
        visibility: row.resource.visibility,
        ownerUserId: row.resource.ownerUserId,
        owningUnitName: row.owningUnit?.name,
        assignedUnitName,
        assignedUserDisplayName,
      }),
      sourceResourceId: sourceResource?.id ?? null,
      sourceResource,
      relatedResources: visibleRelations.map((r) => ({
        id: r.targetResource.id,
        resourceType: r.targetResource.resourceType,
        relationshipType: r.rel.relationshipType,
      })),
    };
  }

  private async availableActions(task: typeof operationalTasks.$inferSelect, user: AuthenticatedUser): Promise<TaskAction[]> {
    try {
      await this.disruptionsService.assertTaskWriteAllowed(task.eventId, user, task.assignedUnitId);
    } catch (error) {
      if (error instanceof ForbiddenException) return [];
      throw error;
    }
    const candidates: Array<[PermissionKey, TaskAction[]]> = [[Permissions.TASK_ASSIGN, ['assign']]];
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      candidates.push([Permissions.TASK_UPDATE, ['reopen']]);
    } else {
      if (task.status === 'OPEN') candidates.push([Permissions.TASK_ACKNOWLEDGE, ['acknowledge']]);
      const work: TaskAction[] = [];
      if (task.status !== 'IN_PROGRESS') work.push('start');
      if (task.status !== 'BLOCKED') work.push('block');
      candidates.push([Permissions.TASK_WORK, work], [Permissions.TASK_COMPLETE, ['complete']], [Permissions.TASK_CANCEL, ['cancel']]);
    }
    const allowed = await Promise.all(candidates.map(async ([permission, actions]) =>
      await this.resourceAccessService.canAccessResource(user, task.id, permission) ? actions : []
    ));
    return allowed.flat();
  }

  /**
   * Lists tasks with authorization filtering.
   */
  async listTasks(
    eventId: string,
    filters: TaskQueryFilters,
    user: AuthenticatedUser
  ): Promise<OperationalTaskItem[]> {
    await this.assertModuleAccess(eventId, user, Permissions.TASK_READ);
    await this.disruptionsService.assertTaskReadAllowed(eventId, user);
    const whereConditions = [eq(operationalTasks.eventId, eventId)];

    if (filters.status) {
      whereConditions.push(eq(operationalTasks.status, filters.status));
    }
    if (filters.priority) {
      whereConditions.push(eq(operationalTasks.priority, filters.priority));
    }
    if (filters.assignedUnitId) {
      whereConditions.push(eq(operationalTasks.assignedUnitId, filters.assignedUnitId));
    }
    if (filters.assignedUserId) {
      whereConditions.push(eq(operationalTasks.assignedUserId, filters.assignedUserId));
    }
    if (filters.owningUnitId) {
      whereConditions.push(eq(operationalTasks.owningUnitId, filters.owningUnitId));
    }
    if (filters.sourceResourceId) {
      whereConditions.push(eq(operationalTasks.sourceResourceId, filters.sourceResourceId));
    }

    const rows = await this.db
      .select({
        task: operationalTasks,
        resource: resources,
      })
      .from(operationalTasks)
      .innerJoin(resources, eq(operationalTasks.id, resources.id))
      .where(and(...whereConditions))
      .orderBy(desc(operationalTasks.createdAt));

    const accessible: OperationalTaskItem[] = [];
    for (const r of rows) {
      const visibleTask = r.task.sourceResourceId && !await this.canReadLinkedResource(eventId, r.task.sourceResourceId, user)
        ? { ...r.task, sourceResourceId: null }
        : r.task;
      try {
        await this.disruptionsService.assertTaskReadAllowed(eventId, user, r.task.assignedUnitId);
      } catch (error) {
        if (error instanceof ForbiddenException) continue;
        throw error;
      }
      const allowed = await this.resourceAccessService.canAccessResource(
        user,
        r.task.id,
        Permissions.TASK_READ
      );
      if (allowed) {
        accessible.push(
          this.mapTaskItem(visibleTask, {
            visibility: r.resource.visibility,
            ownerUserId: r.resource.ownerUserId,
            owningUnitName: await this.getUnitName(r.task.owningUnitId),
            assignedUnitName: await this.getUnitName(r.task.assignedUnitId),
            assignedUserDisplayName: await this.getUserName(r.task.assignedUserId),
          })
        );
      }

    }

    return accessible;
  }

  async listMyWork(
    eventId: string,
    query: MyWorkQuery,
    user: AuthenticatedUser
  ): Promise<MyWorkResponse> {
    const canReadTasks = await this.canUseModule(eventId, user, Permissions.TASK_READ);
    const canReadLaboratory = await this.canUseModule(eventId, user, Permissions.LAB_READ);
    if (!canReadTasks && !canReadLaboratory) throw new ForbiddenException('Work queues are not available in this exercise');
    const requestedUnitId = query.unitId;
    if (query.view === 'unit' && !requestedUnitId) {
      throw new BadRequestException('unitId is required for a unit work queue');
    }

    const canViewEvent = await this.authorizationService.authorize({
      user,
      permission: Permissions.TASK_READ,
      context: { eventId },
    }) || await this.authorizationService.authorize({
      user,
      permission: Permissions.LAB_READ,
      context: { eventId },
    });
    const canViewUnit = requestedUnitId
      ? await this.authorizationService.authorize({
          user,
          permission: Permissions.TASK_READ,
          context: { eventId, unitId: requestedUnitId },
        }) || await this.authorizationService.authorize({
          user,
          permission: Permissions.LAB_READ,
          context: { eventId, unitId: requestedUnitId },
        })
      : false;

    if (!isMyWorkViewAllowed(query.view, canViewUnit, canViewEvent, Boolean(requestedUnitId))) {
      throw new ForbiddenException('Event-wide My Work access is not authorized');
    }

    const units = await this.db.select({ id: organizationalUnits.id, name: organizationalUnits.name })
      .from(organizationalUnits).where(and(eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt)));
    const availableUnits: Array<{ id: string; name: string }> = [];
    for (const unit of units) {
      if (canViewEvent || await this.authorizationService.authorize({ user, permission: Permissions.TASK_READ, context: { eventId, unitId: unit.id } }) ||
          await this.authorizationService.authorize({ user, permission: Permissions.LAB_READ, context: { eventId, unitId: unit.id } })) availableUnits.push(unit);
    }

    const [taskRows, labRows] = await Promise.all([
      this.db.select({ task: operationalTasks, resource: resources })
        .from(operationalTasks)
        .innerJoin(resources, eq(operationalTasks.id, resources.id))
        .where(eq(operationalTasks.eventId, eventId)),
      this.db.select({ analysis: labAnalyses, resource: resources })
        .from(labAnalyses)
        .innerJoin(resources, eq(labAnalyses.id, resources.id))
        .where(eq(resources.eventId, eventId)),
    ]);

    const items: MyWorkItem[] = [];
    for (const row of taskRows) {
      const personal = row.task.assignedUserId === user.id;
      const unitMatch = Boolean(requestedUnitId && row.task.assignedUnitId === requestedUnitId);
      if ((query.view === 'personal' && !personal) ||
        (query.view === 'unit' && !unitMatch) ||
        (query.view === 'event' && !canViewEvent) ||
        !isActionableMyWorkItem({ kind: 'TASK', status: row.task.status })) continue;
      try {
        await this.disruptionsService.assertTaskReadAllowed(eventId, user, row.task.assignedUnitId);
      } catch (error) {
        if (error instanceof ForbiddenException) continue;
        throw error;
      }
      if (!await this.resourceAccessService.canAccessResource(user, row.task.id, Permissions.TASK_READ)) continue;
      items.push({
        id: row.task.id,
        eventId,
        kind: 'TASK',
        identifier: row.task.taskNumber,
        title: row.task.title,
        status: row.task.status,
        assignedToUserId: row.task.assignedUserId,
        assignedUnitId: row.task.assignedUnitId,
        assignedUnitName: await this.getUnitName(row.task.assignedUnitId),
        updatedAt: row.task.updatedAt.toISOString(),
        href: `/events/${eventId}/tasks/${row.task.id}`,
      });
    }
    for (const row of labRows) {
      const personal = row.analysis.assignedToUserId === user.id;
      const unitMatch = Boolean(requestedUnitId && row.analysis.assignedUnitId === requestedUnitId);
      if ((query.view === 'personal' && !personal) ||
        (query.view === 'unit' && !unitMatch) ||
        (query.view === 'event' && !canViewEvent) ||
        !isActionableMyWorkItem({ kind: 'LAB_ANALYSIS', status: row.analysis.status })) continue;
      if (!await this.resourceAccessService.canAccessResource(user, row.analysis.id, Permissions.LAB_READ)) continue;
      items.push({
        id: row.analysis.id,
        eventId,
        kind: 'LAB_ANALYSIS',
        identifier: row.analysis.analysisNumber,
        title: row.analysis.analysisType,
        status: row.analysis.status,
        assignedToUserId: row.analysis.assignedToUserId,
        assignedUnitId: row.analysis.assignedUnitId,
        assignedUnitName: await this.getUnitName(row.analysis.assignedUnitId),
        updatedAt: row.analysis.updatedAt.toISOString(),
        href: `/events/${eventId}/lab/${row.analysis.id}`,
      });
    }

    const paged = sortAndPaginateMyWork(items, query.page, query.limit);
    return {
      items: paged.items,
      total: paged.total,
      page: query.page,
      limit: query.limit,
      view: query.view,
      availableViews: ['personal', ...(availableUnits.length ? ['unit' as const] : []), ...(canViewEvent ? ['event' as const] : [])],
      availableUnits,
    };
  }

  private async validateAssignmentTargets(
    eventId: string,
    assignedUnitId?: string | null,
    assignedUserId?: string | null
  ) {
    if (assignedUnitId) {
      const [unit] = await this.db
        .select({ id: organizationalUnits.id })
        .from(organizationalUnits)
        .where(and(eq(organizationalUnits.id, assignedUnitId), eq(organizationalUnits.eventId, eventId)))
        .limit(1);
      if (!unit) {
        throw new BadRequestException('Assigned organizational unit must belong to the task event');
      }
    }
    if (assignedUserId) {
      const [membership] = await this.db
        .select({ id: eventMemberships.id })
        .from(eventMemberships)
        .innerJoin(users, eq(users.id, eventMemberships.userId))
        .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, assignedUserId), eq(eventMemberships.status, MembershipStatus.ACTIVE), eq(users.status, UserStatus.ACTIVE)))
        .limit(1);
      if (!membership) {
        throw new BadRequestException('Assigned user must be an active member of the task event');
      }
      if (assignedUnitId) {
        const [assignment] = await this.db.select({ id: membershipUnitAssignments.id })
          .from(membershipUnitAssignments)
          .where(and(eq(membershipUnitAssignments.membershipId, membership.id), eq(membershipUnitAssignments.unitId, assignedUnitId)))
          .limit(1);
        if (!assignment) throw new BadRequestException('Assigned user must belong to the assigned unit');
      }
    }
  }

  private async canUseModule(eventId: string, user: AuthenticatedUser, permission: PermissionKey): Promise<boolean> {
    return await this.authorizationService.authorize({ user, permission, context: { eventId } }) ||
      await this.authorizationService.hasEventCapability({ user, permission, eventId, resourceScopes: ['OWN', 'ASSIGNED'] });
  }

  private async assertModuleAccess(eventId: string, user: AuthenticatedUser, permission: PermissionKey): Promise<void> {
    if (!await this.canUseModule(eventId, user, permission)) throw new ForbiddenException('Module is not available in this exercise');
  }

  private async canReadLinkedResource(eventId: string, resourceId: string, user: AuthenticatedUser): Promise<boolean> {
    const linked = await this.resourceService.getResource(resourceId);
    if (!linked || linked.eventId !== eventId) return false;
    const permissionByType: Record<string, PermissionKey> = {
      incident: Permissions.INCIDENT_READ, case: Permissions.CASE_READ,
      evidence: Permissions.EVIDENCE_READ, lab_analysis: Permissions.LAB_READ,
      forensic_analysis: Permissions.FORENSICS_READ, technical_indicator: Permissions.INDICATOR_READ,
      court_case: Permissions.COURT_READ, medical_encounter: Permissions.MEDICAL_READ,
      operational_task: Permissions.TASK_READ, document: Permissions.DOCUMENT_READ,
      person: Permissions.REGISTRY_READ, organisation: Permissions.REGISTRY_READ,
      location: Permissions.REGISTRY_READ, vehicle: Permissions.REGISTRY_READ,
      device: Permissions.REGISTRY_READ, weapon: Permissions.REGISTRY_READ,
    };
    const permission = permissionByType[linked.resourceType];
    return Boolean(permission && await this.resourceAccessService.canAccessResource(user, resourceId, permission));
  }

  private async getUnitName(unitId: string | null) {
    if (!unitId) return undefined;
    const [unit] = await this.db
      .select({ name: organizationalUnits.name })
      .from(organizationalUnits)
      .where(eq(organizationalUnits.id, unitId))
      .limit(1);
    return unit?.name;
  }

  private async getUserName(userId: string | null) {
    if (!userId) return undefined;
    const [user] = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.displayName;
  }

  private mapTaskItem(
    t: typeof operationalTasks.$inferSelect,
    meta: {
      visibility?: string;
      ownerUserId?: string | null;
      owningUnitName?: string;
      assignedUnitName?: string;
      assignedUserDisplayName?: string;
    }
  ): OperationalTaskItem {
    return {
      id: t.id,
      eventId: t.eventId,
      taskNumber: t.taskNumber,
      title: t.title,
      description: t.description,
      status: t.status as any,
      priority: t.priority as any,
      visibility: (meta.visibility as any) || 'EVENT',
      owningUnitId: t.owningUnitId,
      owningUnitName: meta.owningUnitName,
      assignedUnitId: t.assignedUnitId,
      assignedUnitName: meta.assignedUnitName,
      assignedUserId: t.assignedUserId,
      assignedUserDisplayName: meta.assignedUserDisplayName,
      sourceType: t.sourceType,
      sourceResourceId: t.sourceResourceId,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      acknowledgedAt: t.acknowledgedAt ? t.acknowledgedAt.toISOString() : null,
      startedAt: t.startedAt ? t.startedAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      completionNote: t.completionNote,
      blockedReason: t.blockedReason,
      createdByUserId: t.createdByUserId,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
