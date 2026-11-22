import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { scenarioDataBatches, scenarioDraftMedia, ScenarioDataBatchStatus } from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { validRegistryImage, REGISTRY_IMAGE_BYTES_MAX } from '../registry/registry-image-policy.js';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type { ScenarioDraftRecordList, ScenarioDraftRecordListQuery, ScenarioDraftMediaUpload,
  ScenarioDraftMediaRemove, ScenarioDraftMediaItem, ScenarioWorld } from '@cyris/contracts';

const MAX_IMAGES = 50;
type Kind = ScenarioDraftMediaUpload['kind'];
type DraftConfiguration = { rows?: ScenarioWorld; brief?: string };
function draftLabel(kind: Kind, row: ScenarioWorld[Kind][number]): string {
  if ('name' in row) return row.name;
  if ('givenName' in row) return [row.givenName, row.familyName].join(' ');
  if ('make' in row) return row.make + ' ' + row.model;
  if ('manufacturer' in row) return row.manufacturer + ' ' + row.model;
  return 'Record';
}

@Injectable()
export class ScenarioDraftMediaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}
  private get db() { return this.database.client; }
  private async assertAuthorized(eventId: string, user: AuthenticatedUser) {
    await this.authorization.assertAuthorized({ user, permission: Permissions.SCENARIO_MANAGE, context: { eventId } });
    await this.authorization.assertAuthorized({ user, permission: Permissions.REGISTRY_UPDATE, context: { eventId } });
  }
  private async findDraft(eventId: string, batchId: string) {
    const [row] = await this.db.select().from(scenarioDataBatches).where(and(
      eq(scenarioDataBatches.eventId, eventId), eq(scenarioDataBatches.id, batchId),
    )).limit(1);
    if (!row) throw new NotFoundException('Scenario draft not found in this exercise');
    if (row.status !== ScenarioDataBatchStatus.DRAFT) throw new ConflictException('Images can be staged only for an unpublished draft');
    const config = row.configuration as DraftConfiguration;
    if (!config.rows || !config.brief) throw new ConflictException('This batch is not a Spark draft');
    return { rows: config.rows };
  }

  async listRecords(eventId: string, batchId: string, query: ScenarioDraftRecordListQuery,
    user: AuthenticatedUser): Promise<ScenarioDraftRecordList> {
    await this.assertAuthorized(eventId, user);
    const { rows } = await this.findDraft(eventId, batchId);
    const candidates = rows[query.kind];
    const from = (query.page - 1) * query.limit;
    const staged = await this.db.select({ index: scenarioDraftMedia.recordIndex })
      .from(scenarioDraftMedia).where(and(eq(scenarioDraftMedia.eventId, eventId), eq(scenarioDraftMedia.batchId, batchId),
        eq(scenarioDraftMedia.kind, query.kind)));
    const stagedIndexes = new Set(staged.map(item => item.index));
    return {
      kind: query.kind, page: query.page, limit: query.limit, hasMore: candidates.length > from + query.limit,
      records: candidates.slice(from, from + query.limit).map((row, index) => ({
        index: from + index, label: draftLabel(query.kind, row), hasImage: stagedIndexes.has(from + index),
      })),
    };
  }
  async listMedia(eventId: string, batchId: string, user: AuthenticatedUser): Promise<ScenarioDraftMediaItem[]> {
    await this.assertAuthorized(eventId, user);
    await this.findDraft(eventId, batchId);
    const rows = await this.db.select().from(scenarioDraftMedia).where(and(
      eq(scenarioDraftMedia.eventId, eventId), eq(scenarioDraftMedia.batchId, batchId),
    ));
    return rows.map(row => ({ kind: row.kind as Kind, index: row.recordIndex,
      filename: row.filename, mimeType: row.mimeType, byteSize: row.byteSize }));
  }

  async upload(eventId: string, batchId: string, payload: ScenarioDraftMediaUpload, user: AuthenticatedUser) {
    await this.assertAuthorized(eventId, user);
    const { rows } = await this.findDraft(eventId, batchId);
    if (!rows[payload.kind][payload.index]) throw new BadRequestException('Draft record index does not exist');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.data))
      throw new BadRequestException('Invalid base64 image');
    const bytes = Buffer.from(payload.data, 'base64');
    if (!validRegistryImage(payload.mimeType, bytes) || bytes.length > REGISTRY_IMAGE_BYTES_MAX)
      throw new BadRequestException('Unsupported image format or image larger than 5 MB');
    const key = 'scenario-drafts/' + eventId + '/' + batchId + '/' + generateId();
    const stored = await this.storage.putObject(key, bytes, payload.mimeType);
    let previous: { objectKey: string; bucket: string } | null = null;
    try {
      await this.db.transaction(async tx => {
        const [batch] = await tx.select().from(scenarioDataBatches).where(and(
          eq(scenarioDataBatches.eventId, eventId), eq(scenarioDataBatches.id, batchId),
        )).for('update').limit(1);
        if (!batch || batch.status !== ScenarioDataBatchStatus.DRAFT ||
          !(batch.configuration as DraftConfiguration).rows?.[payload.kind][payload.index])
          throw new ConflictException('The selected Spark draft changed or was published');
        const existing = await tx.select().from(scenarioDraftMedia).where(and(
          eq(scenarioDraftMedia.batchId, batchId), eq(scenarioDraftMedia.kind, payload.kind),
          eq(scenarioDraftMedia.recordIndex, payload.index),
        )).limit(1);
        previous = existing[0] ? { objectKey: existing[0].objectKey, bucket: existing[0].bucket } : null;
        if (!previous) {
          const [count] = await tx.select({ n: sql<number>`count(*)::integer` }).from(scenarioDraftMedia)
            .where(eq(scenarioDraftMedia.batchId, batchId));
          if ((count?.n ?? 0) >= MAX_IMAGES) throw new BadRequestException('Maximum 50 draft images per batch');
        }
        await tx.insert(scenarioDraftMedia).values({
          id: generateId(), eventId, batchId, kind: payload.kind, recordIndex: payload.index,
          objectKey: stored.key, bucket: stored.bucket, filename: payload.filename,
          mimeType: payload.mimeType, byteSize: bytes.length, createdByUserId: user.id,
        }).onConflictDoUpdate({
          target: [scenarioDraftMedia.batchId, scenarioDraftMedia.kind, scenarioDraftMedia.recordIndex],
          set: { objectKey: stored.key, bucket: stored.bucket, filename: payload.filename,
            mimeType: payload.mimeType, byteSize: bytes.length, createdByUserId: user.id, createdAt: new Date() },
        });
        await this.audit.record({
          action: 'scenario_data.draft_image.attached', category: 'scenario_data', eventId,
          actorUserId: user.id, resourceType: 'scenario_data_batch', resourceId: batchId,
          metadata: { kind: payload.kind, index: payload.index, mimeType: payload.mimeType, bytes: bytes.length },
          txClient: tx,
        });
      });
    } catch (error) {
      await this.storage.deleteObject(stored.key, stored.bucket).catch(() => undefined);
      throw error;
    }
    const old = previous as { objectKey: string; bucket: string } | null;
    if (old && old.objectKey !== stored.key) {
      await this.storage.deleteObject(old.objectKey, old.bucket).catch(() => undefined);
    }
    return { kind: payload.kind, index: payload.index, filename: payload.filename,
      mimeType: payload.mimeType, byteSize: bytes.length };
  }

  async download(eventId: string, batchId: string, slot: ScenarioDraftMediaRemove, user: AuthenticatedUser) {
    await this.assertAuthorized(eventId, user);
    await this.findDraft(eventId, batchId);
    const [row] = await this.db.select().from(scenarioDraftMedia).where(and(
      eq(scenarioDraftMedia.eventId, eventId), eq(scenarioDraftMedia.batchId, batchId),
      eq(scenarioDraftMedia.kind, slot.kind), eq(scenarioDraftMedia.recordIndex, slot.index),
    )).limit(1);
    if (!row) throw new NotFoundException('Draft image not found');
    const binary = await this.storage.getObject(row.objectKey, row.bucket);
    if (!validRegistryImage(row.mimeType, binary.body)) throw new NotFoundException('Image is not a supported raster file');
    return { body: binary.body, mimeType: row.mimeType, filename: row.filename };
  }

  async remove(eventId: string, batchId: string, slot: ScenarioDraftMediaRemove, user: AuthenticatedUser) {
    await this.assertAuthorized(eventId, user);
    let object: { key: string; bucket: string } | null = null;
    await this.db.transaction(async tx => {
      const [batch] = await tx.select().from(scenarioDataBatches).where(and(
        eq(scenarioDataBatches.eventId, eventId), eq(scenarioDataBatches.id, batchId),
      )).for('update').limit(1);
      if (!batch || batch.status !== ScenarioDataBatchStatus.DRAFT) throw new ConflictException('Draft already published');
      const [row] = await tx.delete(scenarioDraftMedia).where(and(
        eq(scenarioDraftMedia.eventId, eventId), eq(scenarioDraftMedia.batchId, batchId),
        eq(scenarioDraftMedia.kind, slot.kind), eq(scenarioDraftMedia.recordIndex, slot.index),
      )).returning();
      object = row ? { key: row.objectKey, bucket: row.bucket } : null;
      await this.audit.record({
        action: 'scenario_data.draft_image.removed', category: 'scenario_data', eventId,
        actorUserId: user.id, resourceType: 'scenario_data_batch', resourceId: batchId,
        metadata: { kind: slot.kind, index: slot.index, existed: Boolean(row) }, txClient: tx,
      });
    });
    const deleted = object as { key: string; bucket: string } | null;
    if (deleted) {
      await this.storage.deleteObject(deleted.key, deleted.bucket).catch(() => undefined);
    }
    return { success: true };
  }
}
