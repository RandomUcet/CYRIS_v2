import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from './activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import { resources, resourceAssignments } from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { AssignResourceRequest, ResourceAssignmentItem } from '@cyris/contracts';

@Injectable()
export class ResourceAssignmentService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly searchIndexerService: SearchIndexerService
  ) {}

  /**
   * Assigns a resource to a user, organizational unit, or both.
   * Audited, emits an operational activity event, and triggers search reindex.
   */
  async assignResource(
    eventId: string,
    resourceId: string,
    data: AssignResourceRequest,
    actorUserId?: string,
    options?: { activityType?: string; activityTitle?: string; causationId?: string },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any
  ): Promise<ResourceAssignmentItem> {
    const db = txClient || this.databaseService.client;

    const [resource] = await db
      .select({ id: resources.id, resourceType: resources.resourceType })
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    if (!resource) {
      throw new NotFoundException(`Resource '${resourceId}' not found`);
    }

    const assignmentId = generateId();
    const [created] = await db
      .insert(resourceAssignments)
      .values({
        id: assignmentId,
        eventId,
        resourceId,
        userId: data.userId ?? null,
        unitId: data.unitId ?? null,
        assignedByUserId: actorUserId ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    // 1. Audit mutation
    await this.auditService.record({
      action: 'resource.assigned',
      category: 'assignment',
      eventId,
      resourceType: resource.resourceType,
      resourceId,
      actorUserId,
      metadata: {
        userId: data.userId,
        unitId: data.unitId,
        notes: data.notes,
      },
    });

    // 2. Activity event
    await this.activityService.recordActivity(
      {
        eventId,
        resourceId,
        activityType: options?.activityType || 'resource.assigned',
        actorUserId,
        title: options?.activityTitle || `Assigned to ${data.userId ? 'operator' : 'unit'}`,
        summary: data.notes ?? undefined,
        causationId: options?.causationId,
        metadata: {
          assignmentId: created!.id,
          userId: data.userId,
          unitId: data.unitId,
        },
      },
      txClient
    );

    // 3. Search reindexing outbox
    await this.searchIndexerService.emitSearchUpsert(resource.resourceType, resourceId, txClient);

    return {
      id: created!.id,
      eventId: created!.eventId,
      resourceId: created!.resourceId,
      userId: created!.userId,
      unitId: created!.unitId,
      assignedByUserId: created!.assignedByUserId,
      assignedAt: created!.assignedAt.toISOString(),
      notes: created!.notes,
    };
  }

  /**
   * Lists assignments for a resource.
   */
  async listAssignments(resourceId: string): Promise<ResourceAssignmentItem[]> {
    const rows = await this.databaseService.client
      .select()
      .from(resourceAssignments)
      .where(eq(resourceAssignments.resourceId, resourceId))
      .orderBy(desc(resourceAssignments.assignedAt));

    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      resourceId: r.resourceId,
      userId: r.userId,
      unitId: r.unitId,
      assignedByUserId: r.assignedByUserId,
      assignedAt: r.assignedAt.toISOString(),
      notes: r.notes,
    }));
  }
}
