import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { eq, and, or, isNull, desc, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from './activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import {
  resources,
  resourceRelationships,
  resourceAssignments,
  ResourceVisibility,
  type ResourceVisibilityValue,
  persons,
  organisations,
  locations,
  vehicles,
  devices,
  weapons,
  incidents,
  cases,
  evidence,
  operationalTasks,
  documents,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { ResourceItem, ResourceRelationshipItem, ResolvedEntityIdentity } from '@cyris/contracts';

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

  async getRelationship(relationshipId: string): Promise<ResourceRelationshipItem | null> {
    const [row] = await this.databaseService.client
      .select()
      .from(resourceRelationships)
      .where(
        and(
          eq(resourceRelationships.id, relationshipId),
          isNull(resourceRelationships.removedAt)
        )
      )
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      eventId: row.eventId,
      sourceResourceId: row.sourceResourceId,
      targetResourceId: row.targetResourceId,
      relationshipType: row.relationshipType,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      removedAt: row.removedAt ? row.removedAt.toISOString() : null,
      metadata: (row.metadata as Record<string, unknown>) || null,
      source: null,
      target: null,
    };
  }

  /**
   * Creates a directed relationship between two registered resources.
   * Validates both belong to the same event, audits, records activity,
   * and requests search reindexing for both related resources.
   */
  async createRelationship(params: CreateRelationshipParams): Promise<ResourceRelationshipItem> {
    // Self-links create misleading graph loops and may break downstream traversals.
    // Enforce this in the domain service, not only in the browser form.
    if (params.sourceResourceId === params.targetResourceId) {
      throw new BadRequestException('A resource cannot be related to itself');
    }
    if (!params.txClient) {
      return this.databaseService.client.transaction((tx) =>
        this.createRelationship({ ...params, txClient: tx })
      );
    }
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
      txClient: db,
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

    const identityMap = await this.resolveIdentities([created!.sourceResourceId, created!.targetResourceId]);

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
      source: identityMap.get(created!.sourceResourceId) || null,
      target: identityMap.get(created!.targetResourceId) || null,
    };
  }

  /**
   * Soft-removes a relationship by setting removedAt.
   * Audited, emits activity, and schedules search reindex.
   */
  async removeRelationship(relationshipId: string, actorUserId?: string): Promise<void> {
    await this.databaseService.client.transaction((tx) =>
      this.removeRelationshipInTransaction(relationshipId, actorUserId, tx)
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async removeRelationshipInTransaction(relationshipId: string, actorUserId: string | undefined, db: any): Promise<void> {

    const [row] = await db
      .select()
      .from(resourceRelationships)
      .where(and(eq(resourceRelationships.id, relationshipId), isNull(resourceRelationships.removedAt)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Active relationship '${relationshipId}' not found`);
    }

    const [source, target] = await Promise.all([
      this.getResource(row.sourceResourceId, db),
      this.getResource(row.targetResourceId, db),
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
      txClient: db,
    });

    // 2. Activity
    await this.activityService.recordActivity({
      eventId: row.eventId,
      resourceId: row.sourceResourceId,
      activityType: 'relationship.removed',
      actorUserId,
      title: `Unlinked ${row.relationshipType} relationship`,
      relatedResourceIds: [row.targetResourceId],
    }, db);

    // 3. Search reindex
    if (source && target) {
      await this.searchIndexerService.requestRelationshipReindex(
        { type: source.resourceType, id: source.id },
        { type: target.resourceType, id: target.id },
        db
      );
    }
  }

  /**
   * Resolves human-facing identifiers and titles for a batch of resource IDs.
   */
  async resolveIdentities(resourceIds: string[]): Promise<Map<string, ResolvedEntityIdentity>> {
    const map = new Map<string, ResolvedEntityIdentity>();
    const uniqueIds = Array.from(new Set(resourceIds.filter(Boolean)));
    if (uniqueIds.length === 0) return map;

    const db = this.databaseService.client;
    const resRows = await db
      .select({ id: resources.id, resourceType: resources.resourceType })
      .from(resources)
      .where(inArray(resources.id, uniqueIds));

    const typeGroups = new Map<string, string[]>();
    for (const r of resRows) {
      const list = typeGroups.get(r.resourceType) || [];
      list.push(r.id);
      typeGroups.set(r.resourceType, list);
    }

    const typeQueries: Promise<void>[] = [];

    if (typeGroups.has('person')) {
      typeQueries.push(
        db
          .select({ id: persons.id, identifier: persons.identifier, title: persons.displayName })
          .from(persons)
          .where(inArray(persons.id, typeGroups.get('person')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `PER-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'person',
              });
            }
          })
      );
    }

    if (typeGroups.has('organisation')) {
      typeQueries.push(
        db
          .select({ id: organisations.id, identifier: organisations.identifier, title: organisations.name })
          .from(organisations)
          .where(inArray(organisations.id, typeGroups.get('organisation')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `ORG-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'organisation',
              });
            }
          })
      );
    }

    if (typeGroups.has('location')) {
      typeQueries.push(
        db
          .select({ id: locations.id, identifier: locations.identifier, title: locations.name })
          .from(locations)
          .where(inArray(locations.id, typeGroups.get('location')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `LOC-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'location',
              });
            }
          })
      );
    }

    if (typeGroups.has('vehicle')) {
      typeQueries.push(
        db
          .select({ id: vehicles.id, identifier: vehicles.identifier, title: vehicles.label })
          .from(vehicles)
          .where(inArray(vehicles.id, typeGroups.get('vehicle')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `VEH-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'vehicle',
              });
            }
          })
      );
    }

    if (typeGroups.has('device')) {
      typeQueries.push(
        db
          .select({ id: devices.id, identifier: devices.identifier, title: devices.label })
          .from(devices)
          .where(inArray(devices.id, typeGroups.get('device')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `DEV-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'device',
              });
            }
          })
      );
    }

    if (typeGroups.has('weapon')) {
      typeQueries.push(
        db
          .select({
            id: weapons.id,
            identifier: weapons.identifier,
            model: weapons.model,
            manufacturer: weapons.manufacturer,
            category: weapons.category,
          })
          .from(weapons)
          .where(inArray(weapons.id, typeGroups.get('weapon')!))
          .then((rows) => {
            for (const row of rows) {
              const title = [row.manufacturer, row.model].filter(Boolean).join(' ') || row.category || 'Weapon';
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `WPN-${row.id.slice(0, 8)}`,
                title,
                type: 'weapon',
              });
            }
          })
      );
    }

    if (typeGroups.has('incident')) {
      typeQueries.push(
        db
          .select({ id: incidents.id, identifier: incidents.incidentNumber, title: incidents.title })
          .from(incidents)
          .where(inArray(incidents.id, typeGroups.get('incident')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `INC-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'incident',
              });
            }
          })
      );
    }

    if (typeGroups.has('case')) {
      typeQueries.push(
        db
          .select({ id: cases.id, identifier: cases.caseNumber, title: cases.title })
          .from(cases)
          .where(inArray(cases.id, typeGroups.get('case')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `CASE-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'case',
              });
            }
          })
      );
    }

    if (typeGroups.has('evidence')) {
      typeQueries.push(
        db
          .select({ id: evidence.id, identifier: evidence.evidenceNumber, title: evidence.title })
          .from(evidence)
          .where(inArray(evidence.id, typeGroups.get('evidence')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `E-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'evidence',
              });
            }
          })
      );
    }

    if (typeGroups.has('operational_task') || typeGroups.has('task')) {
      const taskIds = [...(typeGroups.get('operational_task') || []), ...(typeGroups.get('task') || [])];
      typeQueries.push(
        db
          .select({ id: operationalTasks.id, identifier: operationalTasks.taskNumber, title: operationalTasks.title })
          .from(operationalTasks)
          .where(inArray(operationalTasks.id, taskIds))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `TASK-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'task',
              });
            }
          })
      );
    }

    if (typeGroups.has('document')) {
      typeQueries.push(
        db
          .select({ id: documents.id, identifier: documents.documentNumber, title: documents.title })
          .from(documents)
          .where(inArray(documents.id, typeGroups.get('document')!))
          .then((rows) => {
            for (const row of rows) {
              map.set(row.id, {
                id: row.id,
                identifier: row.identifier || `DOC-${row.id.slice(0, 8)}`,
                title: row.title,
                type: 'document',
              });
            }
          })
      );
    }

    await Promise.all(typeQueries);

    // Any remaining resources that didn't have a domain table match
    for (const r of resRows) {
      if (!map.has(r.id)) {
        map.set(r.id, {
          id: r.id,
          identifier: `${r.resourceType.toUpperCase()}-${r.id.slice(0, 8)}`,
          title: r.resourceType.toUpperCase(),
          type: r.resourceType,
        });
      }
    }

    return map;
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

    const allIds = rows.flatMap((r) => [r.sourceResourceId, r.targetResourceId]);
    const identityMap = await this.resolveIdentities(allIds);

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
      source: identityMap.get(r.sourceResourceId) || null,
      target: identityMap.get(r.targetResourceId) || null,
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

    const allIds = rows.flatMap((r) => [r.sourceResourceId, r.targetResourceId]);
    const identityMap = await this.resolveIdentities(allIds);

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
      source: identityMap.get(r.sourceResourceId) || null,
      target: identityMap.get(r.targetResourceId) || null,
    }));
  }
}
