import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
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
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type {
  OperationalTaskItem,
  OperationalTaskDetail,
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
    private readonly authorizationService: AuthorizationService
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
    await this.validateAssignmentTargets(eventId, dto.assignedUnitId, dto.assignedUserId);
    const taskId = generateId();

    return this.db.transaction(async (tx) => {
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
          owningUnitId: dto.owningUnitId || null,
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

      if (dto.assignedUserId) {
        await this.notificationsService.emit({
          userId: dto.assignedUserId,
          eventId,
          type: 'TASK_ASSIGNED',
          severity: 'ACTION',
          templateKey: 'task.assigned',
          templateParams: {
            taskNumber,
            title: dto.title,
          },
          resourceId: taskId,
          actionUrl: `/events/${eventId}/tasks/${taskId}`,
          sourceEventId: `task-assign-${taskId}-${dto.assignedUserId}`,
        });
      }

      return this.mapTaskItem(created!, {
        visibility: dto.visibility,
        ownerUserId: user.id,
      });
    });
  }

  /**
   * Updates task general metadata.
   */
  async updateTask(
    taskId: string,
    dto: UpdateOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_UPDATE
    );

    const [existing] = await this.db
      .select()
      .from(operationalTasks)
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.priority !== undefined) updates.priority = dto.priority;
    if (dto.dueAt !== undefined) updates.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;

    await this.db
      .update(operationalTasks)
      .set(updates)
      .where(eq(operationalTasks.id, taskId));

    await this.auditService.record({
      action: 'task.updated',
      category: 'tasks',
      eventId: existing.eventId,
      resourceType: 'operational_task',
      resourceId: taskId,
      actorUserId: user.id,
      metadata: updates,
    });

    await this.searchIndexer.emitSearchUpsert('operational_task', taskId);

    return this.getTaskDetail(taskId, user);
  }

  /**
   * Assigns task to a unit and/or user.
   */
  async assignTask(
    taskId: string,
    dto: AssignOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_ASSIGN
    );

    const [existing] = await this.db
      .select()
      .from(operationalTasks)
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }
    await this.validateAssignmentTargets(existing.eventId, dto.assignedUnitId, dto.assignedUserId);

    const now = new Date();
    await this.db
      .update(operationalTasks)
      .set({
        assignedUnitId: dto.assignedUnitId || null,
        assignedUserId: dto.assignedUserId || null,
        updatedAt: now,
      })
      .where(eq(operationalTasks.id, taskId));

    await this.auditService.record({
      action: 'task.assigned',
      category: 'tasks',
      eventId: existing.eventId,
      resourceType: 'operational_task',
      resourceId: taskId,
      actorUserId: user.id,
      metadata: {
        taskNumber: existing.taskNumber,
        assignedUnitId: dto.assignedUnitId,
        assignedUserId: dto.assignedUserId,
        notes: dto.notes,
      },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: taskId,
      activityType: 'task.assigned',
      actorUserId: user.id,
      title: `Task Assigned: ${existing.taskNumber}`,
      summary: dto.notes || `Assigned to Unit: ${dto.assignedUnitId || 'None'} / User: ${dto.assignedUserId || 'None'}`,
    });

    await this.searchIndexer.emitSearchUpsert('operational_task', taskId);

    if (dto.assignedUserId) {
      await this.notificationsService.emit({
        userId: dto.assignedUserId,
        eventId: existing.eventId,
        type: 'TASK_ASSIGNED',
        severity: 'ACTION',
        templateKey: 'task.assigned',
        templateParams: {
          taskNumber: existing.taskNumber,
          title: existing.title,
        },
        resourceId: taskId,
        actionUrl: `/events/${existing.eventId}/tasks/${taskId}`,
        sourceEventId: `task-assign-${taskId}-${dto.assignedUserId}`,
      });
    }

    return this.getTaskDetail(taskId, user);
  }

  /**
   * Acknowledges task receipt by assigned unit/user.
   */
  async acknowledgeTask(
    taskId: string,
    dto: AcknowledgeOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_ACKNOWLEDGE
    );

    const [existing] = await this.db
      .select()
      .from(operationalTasks)
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot acknowledge task in ${existing.status} status`);
    }

    const now = new Date();
    await this.db
      .update(operationalTasks)
      .set({
        status: 'ACKNOWLEDGED',
        acknowledgedAt: now,
        updatedAt: now,
      })
      .where(eq(operationalTasks.id, taskId));

    await this.auditService.record({
      action: 'task.acknowledged',
      category: 'tasks',
      eventId: existing.eventId,
      resourceType: 'operational_task',
      resourceId: taskId,
      actorUserId: user.id,
      metadata: { taskNumber: existing.taskNumber, notes: dto.notes },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: taskId,
      activityType: 'task.acknowledged',
      actorUserId: user.id,
      title: `Task Acknowledged: ${existing.taskNumber}`,
      summary: dto.notes || 'Task received and acknowledged by operative',
    });

    await this.searchIndexer.emitSearchUpsert('operational_task', taskId);

    return this.getTaskDetail(taskId, user);
  }

  /**
   * Starts work on task (transitions to IN_PROGRESS).
   */
  async startTask(
    taskId: string,
    dto: StartOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_WORK
    );

    const [existing] = await this.db
      .select()
      .from(operationalTasks)
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot start task in ${existing.status} status. Reopen first.`);
    }

    const now = new Date();
    await this.db
      .update(operationalTasks)
      .set({
        status: 'IN_PROGRESS',
        startedAt: existing.startedAt || now,
        blockedReason: null,
        updatedAt: now,
      })
      .where(eq(operationalTasks.id, taskId));

    await this.auditService.record({
      action: 'task.started',
      category: 'tasks',
      eventId: existing.eventId,
      resourceType: 'operational_task',
      resourceId: taskId,
      actorUserId: user.id,
      metadata: { taskNumber: existing.taskNumber, notes: dto.notes },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: taskId,
      activityType: 'task.started',
      actorUserId: user.id,
      title: `Task In Progress: ${existing.taskNumber}`,
      summary: dto.notes || 'Work actively commenced on operational task',
    });

    await this.searchIndexer.emitSearchUpsert('operational_task', taskId);

    return this.getTaskDetail(taskId, user);
  }

  /**
   * Marks task as blocked with required reason.
   */
  async blockTask(
    taskId: string,
    dto: BlockOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_WORK
    );

    const [existing] = await this.db
      .select()
      .from(operationalTasks)
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot block task in ${existing.status} status`);
    }

    const now = new Date();
    await this.db
      .update(operationalTasks)
      .set({
        status: 'BLOCKED',
        blockedReason: dto.reason,
        updatedAt: now,
      })
      .where(eq(operationalTasks.id, taskId));

    await this.auditService.record({
      action: 'task.blocked',
      category: 'tasks',
      eventId: existing.eventId,
      resourceType: 'operational_task',
      resourceId: taskId,
      actorUserId: user.id,
      metadata: { taskNumber: existing.taskNumber, reason: dto.reason },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: taskId,
      activityType: 'task.blocked',
      actorUserId: user.id,
      title: `Task Blocked: ${existing.taskNumber}`,
      summary: `Blocked reason: ${dto.reason}`,
    });

    await this.searchIndexer.emitSearchUpsert('operational_task', taskId);

    return this.getTaskDetail(taskId, user);
  }

  /**
   * Completes task with optional completion note.
   */
  async completeTask(
    taskId: string,
    dto: CompleteOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_COMPLETE
    );

    const [existing] = await this.db
      .select()
      .from(operationalTasks)
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }

    const now = new Date();
    await this.db
      .update(operationalTasks)
      .set({
        status: 'COMPLETED',
        completedAt: now,
        completionNote: dto.completionNote || null,
        blockedReason: null,
        updatedAt: now,
      })
      .where(eq(operationalTasks.id, taskId));

    await this.auditService.record({
      action: 'task.completed',
      category: 'tasks',
      eventId: existing.eventId,
      resourceType: 'operational_task',
      resourceId: taskId,
      actorUserId: user.id,
      metadata: { taskNumber: existing.taskNumber, note: dto.completionNote },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: taskId,
      activityType: 'task.completed',
      actorUserId: user.id,
      title: `Task Completed: ${existing.taskNumber} — ${existing.title}`,
      summary: dto.completionNote || 'Operational task concluded successfully',
    });

    await this.searchIndexer.emitSearchUpsert('operational_task', taskId);

    return this.getTaskDetail(taskId, user);
  }

  /**
   * Cancels task with required reason.
   */
  async cancelTask(
    taskId: string,
    dto: CancelOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_CANCEL
    );

    const [existing] = await this.db
      .select()
      .from(operationalTasks)
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }

    const now = new Date();
    await this.db
      .update(operationalTasks)
      .set({
        status: 'CANCELLED',
        blockedReason: dto.reason,
        updatedAt: now,
      })
      .where(eq(operationalTasks.id, taskId));

    await this.auditService.record({
      action: 'task.cancelled',
      category: 'tasks',
      eventId: existing.eventId,
      resourceType: 'operational_task',
      resourceId: taskId,
      actorUserId: user.id,
      metadata: { taskNumber: existing.taskNumber, reason: dto.reason },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: taskId,
      activityType: 'task.cancelled',
      actorUserId: user.id,
      title: `Task Cancelled: ${existing.taskNumber}`,
      summary: `Cancellation reason: ${dto.reason}`,
    });

    await this.searchIndexer.emitSearchUpsert('operational_task', taskId);

    return this.getTaskDetail(taskId, user);
  }

  /**
   * Reopens a completed or cancelled task.
   * Explicit action with required operational justification.
   */
  async reopenTask(
    taskId: string,
    dto: ReopenOperationalTaskRequest,
    user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      taskId,
      Permissions.TASK_UPDATE
    );

    const [existing] = await this.db
      .select()
      .from(operationalTasks)
      .where(eq(operationalTasks.id, taskId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Task '${taskId}' not found`);
    }

    if (existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED') {
      throw new BadRequestException(`Task is in ${existing.status} status and cannot be reopened`);
    }

    const now = new Date();
    await this.db
      .update(operationalTasks)
      .set({
        status: dto.newStatus || 'OPEN',
        completedAt: null,
        blockedReason: null,
        updatedAt: now,
      })
      .where(eq(operationalTasks.id, taskId));

    await this.auditService.record({
      action: 'task.reopened',
      category: 'tasks',
      eventId: existing.eventId,
      resourceType: 'operational_task',
      resourceId: taskId,
      actorUserId: user.id,
      metadata: {
        taskNumber: existing.taskNumber,
        previousStatus: existing.status,
        newStatus: dto.newStatus || 'OPEN',
        reason: dto.reason,
      },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: taskId,
      activityType: 'task.reopened',
      actorUserId: user.id,
      title: `Task Reopened: ${existing.taskNumber}`,
      summary: `Reopen reason: ${dto.reason}`,
    });

    await this.searchIndexer.emitSearchUpsert('operational_task', taskId);

    return this.getTaskDetail(taskId, user);
  }

  /**
   * Retrieves single task detail with relationships and access check.
   */
  async getTaskDetail(taskId: string, user: AuthenticatedUser): Promise<OperationalTaskDetail> {
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
    if (row.task.sourceResourceId) {
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
      .where(eq(resourceRelationships.sourceResourceId, taskId));

    return {
      ...this.mapTaskItem(row.task, {
        visibility: row.resource.visibility,
        ownerUserId: row.resource.ownerUserId,
        owningUnitName: row.owningUnit?.name,
        assignedUnitName,
        assignedUserDisplayName,
      }),
      sourceResource,
      relatedResources: relations.map((r) => ({
        id: r.targetResource.id,
        resourceType: r.targetResource.resourceType,
        relationshipType: r.rel.relationshipType,
      })),
    };
  }

  /**
   * Lists tasks with authorization filtering.
   */
  async listTasks(
    eventId: string,
    filters: TaskQueryFilters,
    user: AuthenticatedUser
  ): Promise<OperationalTaskItem[]> {
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
      const allowed = await this.resourceAccessService.canAccessResource(
        user,
        r.task.id,
        Permissions.TASK_READ
      );
      if (allowed) {
        accessible.push(
          this.mapTaskItem(r.task, {
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
        .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, assignedUserId)))
        .limit(1);
      if (!membership) {
        throw new BadRequestException('Assigned user must be a member of the task event');
      }
    }
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
