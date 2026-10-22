import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { eq, and, or, isNull, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from './activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import { resources, resourceRelationships, ResourceVisibility, type ResourceVisibilityValue } from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { ResourceItem, ResourceRelationshipItem } from '@cyris/contracts';

export interface RegisterResourceOptions {
  id?: string;
  visibility?: ResourceVisibilityValue;
  owningUnitId?: string | null;
  ownerUserId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any;
}

export interface CreateRelationshipParams {
  eventId?: string;
  sourceResourceId: string;
  targetResourceId: string;
  relationshipType: string;
  createdByUserId?: string | null;
  metadata?: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any;
}

@Injectable()
export class ResourceService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly searchIndexerService: SearchIndexerService
  ) {}

  /**
   * Registers a cross-domain resource in the common registry.
   * All typed domain entities share the SAME UUID with this record.
   */
  async registerResource(
    eventId: string,
    resourceType: string,
    options?: RegisterResourceOptions
  ): Promise<ResourceItem> {
    const resourceId = options?.id ?? generateId();
    const db = options?.txClient || this.databaseService.client;

    const [created] = await db
      .insert(resources)
      .values({
        id: resourceId,
        eventId,
        resourceType,
        visibility: options?.visibility ?? ResourceVisibility.EVENT,
        owningUnitId: options?.owningUnitId ?? null,
        ownerUserId: options?.ownerUserId ?? null,
      })
      .returning();

    return {
      id: created!.id,
      eventId: created!.eventId,
      resourceType: created!.resourceType,
      visibility: created!.visibility as 'EVENT' | 'UNIT' | 'RESTRICTED' | 'SCENARIO',
      owningUnitId: created!.owningUnitId,
      ownerUserId: created!.ownerUserId,
      createdAt: created!.createdAt.toISOString(),
      updatedAt: created!.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves a resource by ID.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getResource(id: string, txClient?: any): Promise<ResourceItem | null> {
    const db = txClient || this.databaseService.client;
    const [row] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, id))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      eventId: row.eventId,
      resourceType: row.resourceType,
      visibility: row.visibility as 'EVENT' | 'UNIT' | 'RESTRICTED' | 'SCENARIO',
      owningUnitId: row.owningUnitId,
      ownerUserId: row.ownerUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Creates a directed relationship between two registered resources.
   * Validates both belong to the same event, audits, records activity,
   * and requests search reindexing for both related resources.
   */
  async createRelationship(params: CreateRelationshipParams): Promise<ResourceRelationshipItem> {
    const db = params.txClient || this.databaseService.client;

    const [source, target] = await Promise.all([
      this.getResource(params.sourceResourceId, db),
      this.getResource(params.targetResourceId, db),
    ]);

    if (!source) {
      throw new NotFoundException(`Source resource '${params.sourceResourceId}' not found`);
    }
    if (!target) {
      throw new NotFoundException(`Target resource '${params.targetResourceId}' not found`);
    }

    const eventId = params.eventId || source.eventId;

    // Validation: both resources must belong to the same event
    if (source.eventId !== target.eventId || source.eventId !== eventId) {
      throw new BadRequestException('Cannot create relationship: resources belong to different events');
    }

    // Check for existing active duplicate relationship
    const [existing] = await db
      .select({ id: resourceRelationships.id })
      .from(resourceRelationships)
      .where(
        and(
          eq(resourceRelationships.eventId, eventId),
          eq(resourceRelationships.sourceResourceId, params.sourceResourceId),
          eq(resourceRelationships.targetResourceId, params.targetResourceId),
          eq(resourceRelationships.relationshipType, params.relationshipType),
          isNull(resourceRelationships.removedAt)
        )
      )
      .limit(1);

    if (existing) {
      throw new ConflictException('An active relationship of this type already exists between these resources');
    }

    const [created] = await db
      .insert(resourceRelationships)
      .values({
        id: generateId(),
        eventId,
        sourceResourceId: params.sourceResourceId,
        targetResourceId: params.targetResourceId,
        relationshipType: params.relationshipType,
        createdByUserId: params.createdByUserId ?? null,
        metadata: params.metadata ?? null,
      })
      .returning();

    // 1. Audit relationship creation
    await this.auditService.record({
      action: 'relationship.created',
      category: 'relationship',
      eventId,
      resourceType: 'relationship',
      resourceId: created!.id,
      actorUserId: params.createdByUserId,
      metadata: {
        sourceResourceId: params.sourceResourceId,
        sourceResourceType: source.resourceType,
        targetResourceId: params.targetResourceId,
        targetResourceType: target.resourceType,
        relationshipType: params.relationshipType,
      },
    });

    // 2. Record operational activity
    await this.activityService.recordActivity(
      {
        eventId,
        resourceId: params.sourceResourceId,
        activityType: 'relationship.created',
        actorUserId: params.createdByUserId,
        title: `Linked to ${target.resourceType} via '${params.relationshipType}'`,
        relatedResourceIds: [params.targetResourceId],
        metadata: {
          relationshipId: created!.id,
          relationshipType: params.relationshipType,
          targetResourceId: params.targetResourceId,
          targetResourceType: target.resourceType,
        },
      },
      db
    );

    // 3. Reindex both resources in search outbox
    await this.searchIndexerService.requestRelationshipReindex(
      { type: source.resourceType, id: source.id },
      { type: target.resourceType, id: target.id },
      db
    );

    return {
      id: created!.id,
      eventId: created!.eventId,
      sourceResourceId: created!.sourceResourceId,
      targetResourceId: created!.targetResourceId,
      relationshipType: created!.relationshipType,
      createdByUserId: created!.createdByUserId,
      createdAt: created!.createdAt.toISOString(),
      removedAt: created!.removedAt ? created!.removedAt.toISOString() : null,
      metadata: (created!.metadata as Record<string, unknown>) || null,
    };
  }

  /**
   * Soft-removes a relationship by setting removedAt.
   * Audited, emits activity, and schedules search reindex.
   */
  async removeRelationship(relationshipId: string, actorUserId?: string): Promise<void> {
    const db = this.databaseService.client;

    const [row] = await db
      .select()
      .from(resourceRelationships)
      .where(and(eq(resourceRelationships.id, relationshipId), isNull(resourceRelationships.removedAt)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Active relationship '${relationshipId}' not found`);
    }

    const [source, target] = await Promise.all([
      this.getResource(row.sourceResourceId),
      this.getResource(row.targetResourceId),
    ]);

    await db
      .update(resourceRelationships)
      .set({ removedAt: new Date() })
      .where(eq(resourceRelationships.id, relationshipId));

    // 1. Audit
    await this.auditService.record({
      action: 'relationship.removed',
      category: 'relationship',
      eventId: row.eventId,
      resourceType: 'relationship',
      resourceId: relationshipId,
      actorUserId,
      metadata: {
        sourceResourceId: row.sourceResourceId,
        targetResourceId: row.targetResourceId,
        relationshipType: row.relationshipType,
      },
    });

    // 2. Activity
    await this.activityService.recordActivity({
      eventId: row.eventId,
      resourceId: row.sourceResourceId,
      activityType: 'relationship.removed',
      actorUserId,
      title: `Unlinked ${row.relationshipType} relationship`,
      relatedResourceIds: [row.targetResourceId],
    });

    // 3. Search reindex
    if (source && target) {
      await this.searchIndexerService.requestRelationshipReindex(
        { type: source.resourceType, id: source.id },
        { type: target.resourceType, id: target.id }
      );
    }
  }

  /**
   * Lists all active relationships for a given resource (as either source or target).
   */
  async listRelationships(resourceId: string): Promise<ResourceRelationshipItem[]> {
    const rows = await this.databaseService.client
      .select()
      .from(resourceRelationships)
      .where(
        and(
          or(
            eq(resourceRelationships.sourceResourceId, resourceId),
            eq(resourceRelationships.targetResourceId, resourceId)
          ),
          isNull(resourceRelationships.removedAt)
        )
      )
      .orderBy(desc(resourceRelationships.createdAt));

    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      sourceResourceId: r.sourceResourceId,
      targetResourceId: r.targetResourceId,
      relationshipType: r.relationshipType,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt.toISOString(),
      removedAt: r.removedAt ? r.removedAt.toISOString() : null,
      metadata: (r.metadata as Record<string, unknown>) || null,
    }));
  }

  /**
   * Lists all active relationships for an entire event (for interactive graph explorer).
   */
  async listEventRelationships(eventId: string, limit = 500): Promise<ResourceRelationshipItem[]> {
    const rows = await this.databaseService.client
      .select()
      .from(resourceRelationships)
      .where(
        and(
          eq(resourceRelationships.eventId, eventId),
          isNull(resourceRelationships.removedAt)
        )
      )
      .orderBy(desc(resourceRelationships.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      sourceResourceId: r.sourceResourceId,
      targetResourceId: r.targetResourceId,
      relationshipType: r.relationshipType,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt.toISOString(),
      removedAt: null,
      metadata: (r.metadata as Record<string, unknown>) || null,
    }));
  }
}
