import { createHash } from 'node:crypto';
import { Injectable, BadRequestException, ConflictException, ForbiddenException, BadGatewayException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, desc, eq, getTableColumns, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { AIGatewayService } from '../ai/ai-gateway.service.js';
import { emptyWorld, fullName, kinds, localWorld, nameKey, rowSchemas, samples, type World } from './world.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  scenarioDataBatches,
  ScenarioDataBatchStatus,
  events,
  persons,
  organisations,
  locations,
  vehicles,
  devices,
  weapons,
  resources,
  registryMedia,
  resourceRelationships,
  outboxEvents,
  OutboxStatus,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { ScenarioLinkSlots } from '@cyris/contracts';
import type { ScenarioDataCounts, SparkDraftRequest, ScenarioDataRequest, ScenarioDataPreview, ScenarioDataBatchResponse, ScenarioBatchMediaQuery, ScenarioBatchMediaList } from '@cyris/contracts';

const GENERATOR_VERSION = 2;
const PRESETS: Record<string, ScenarioDataCounts> = {
  SMALL: { persons: 40, organisations: 6, locations: 12, vehicles: 20, devices: 25, weapons: 5 },
  STANDARD: { persons: 250, organisations: 35, locations: 60, vehicles: 120, devices: 180, weapons: 40 },
  LARGE: { persons: 800, organisations: 100, locations: 150, vehicles: 350, devices: 500, weapons: 100 },
};

type Tx = Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];

type Kind = keyof World;
type DraftLink = { source: Kind; index: number; target: Kind; targetIndex: number; relation: string };
type Settings = ScenarioDataCounts & { brief?: string; prepared?: number; rows?: World; draftLinks?: DraftLink[] };
const draftOrder: Kind[] = ['locations', 'organisations', 'vehicles', 'devices', 'persons', 'weapons'];
const relatedKinds: Record<Kind, Partial<Record<Kind, string>>> = {
  locations: {}, organisations: { locations: 'LOCATED_AT' }, vehicles: { locations: 'LOCATED_AT' },
  devices: { locations: 'LOCATED_AT' }, persons: { organisations: 'EMPLOYED_BY', devices: 'USES', vehicles: 'OWNER_OF' },
  weapons: { persons: 'RELATED_TO' },
};
function candidateLinks(kind: Kind, world: World, position: number) {
  const result: Array<{ target: Kind; targetIndex: number; relation: string; label: string }> = [];
  for (const target of kinds) {
    const relation = relatedKinds[kind][target];
    if (!relation) continue;
    const entries = world[target];
    for (let i = 0; i < Math.min(6, entries.length); i++) {
      const targetIndex = (position + i) % entries.length;
      const row = entries[targetIndex]!;
      const label = 'name' in row ? row.name : 'givenName' in row ? fullName(row) : 'make' in row ? row.make + ' ' + row.model : row.manufacturer + ' ' + row.model;
      result.push({ target, targetIndex, relation, label });
    }
  }
  return result;
}
const total = (counts: ScenarioDataCounts) => kinds.reduce((sum, k) => sum + counts[k], 0);
function cleanCounts(settings: Settings): ScenarioDataCounts {
  const { persons, organisations, locations, vehicles, devices, weapons } = settings;
  return { persons, organisations, locations, vehicles, devices, weapons };
}
const previewToken = (world: World) => createHash('sha256').update(JSON.stringify(world)).digest('hex');
const personDetails = (world: World) => world.persons.slice(0, 4).map(p => ({ name: fullName(p), description: p.description, dateOfBirth: p.dateOfBirth }));

@Injectable()
export class ScenarioDataService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceService: ResourceService,
    private readonly ai: AIGatewayService,
    private readonly identifiers: IdentifierAllocatorService,
    private readonly searchIndexerService: SearchIndexerService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) { }

  private async assertManage(eventId: string, user: AuthenticatedUser) {
    await this.authorizationService.assertAuthorized({
      user,
      permission: Permissions.SCENARIO_MANAGE,
      context: { eventId },
    });
  }

  private counts(request: ScenarioDataRequest): ScenarioDataCounts {
    const counts = request.preset === 'CUSTOM' ? request.counts : PRESETS[request.preset];
    if (!counts) throw new BadRequestException('Custom counts are required');
    const total = (Object.values(counts) as number[]).reduce((sum, value) => sum + value, 0);
    if (total > 12000) throw new BadRequestException('The total generated record limit is 12000');
    if (total === 0) throw new BadRequestException('Choose at least one record');
    return counts;
  }

  private response(row: typeof scenarioDataBatches.$inferSelect): ScenarioDataBatchResponse {
    const settings = row.configuration as Settings;
    return {
      source: settings.brief ? 'SPARK' : 'LOCAL', prepared: settings.prepared, brief: settings.brief,
      ...(settings.rows && { samples: samples(settings.rows), personDetails: personDetails(settings.rows) }),
      id: row.id, eventId: row.eventId, identifier: row.identifier, generatorVersion: row.generatorVersion,
      seed: row.seed, preset: row.preset as ScenarioDataBatchResponse['preset'],
      configuration: cleanCounts(settings), status: row.status,
      counts: row.counts as ScenarioDataCounts | null, relationshipCount: settings.draftLinks?.length ?? row.relationshipCount,
      createdByUserId: row.createdByUserId, createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null,
      cleanedAt: row.cleanedAt?.toISOString() ?? null, failureMessage: row.failureMessage,
    };
  }

  async preview(eventId: string, request: ScenarioDataRequest, user: AuthenticatedUser): Promise<ScenarioDataPreview> {
    await this.assertManage(eventId, user);
    const counts = this.counts(request);
    const world = localWorld(request.seed, counts, await this.existingNames(eventId));
    const countMatching = (count: number, predicate: (index: number) => boolean) =>
      Array.from({ length: count }, (_, index) => index).filter(predicate).length;
    const estimatedRelationships =
      (counts.organisations ? countMatching(counts.persons, i => i % 10 < 8) : 0) +
      (counts.vehicles ? countMatching(counts.persons, i => i % 3 === 0) : 0) +
      (counts.devices ? countMatching(counts.persons, i => i % 2 === 0) : 0) +
      (counts.locations ? counts.organisations + Math.ceil(counts.vehicles / 2) + Math.ceil(counts.devices / 3) : 0) +
      (counts.persons ? Math.ceil(counts.weapons / 2) : 0);
    return {
      counts, estimatedRelationships, previewToken: previewToken(world), samples: samples(world), personDetails: personDetails(world)
    };
  }

  async list(eventId: string, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    const rows = await this.databaseService.client.select({ ...getTableColumns(scenarioDataBatches), configuration: sql<Settings>`${scenarioDataBatches.configuration} - 'rows' - 'draftLinks'` }).from(scenarioDataBatches)
      .where(eq(scenarioDataBatches.eventId, eventId)).orderBy(desc(scenarioDataBatches.createdAt));
    return rows.map((row) => this.response(row));
  }

  async get(eventId: string, batchId: string, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    const [row] = await this.databaseService.client.select().from(scenarioDataBatches)
      .where(and(eq(scenarioDataBatches.id, batchId), eq(scenarioDataBatches.eventId, eventId))).limit(1);
    if (!row) throw new BadRequestException('Generation batch not found');
    return this.response(row);
  }


  /**
   * Lists only synthetic rows from one completed batch and the selected event.
   * No draft details, other exercises, or sensitive S3 object keys are returned.
   */
  async listBatchRecords(eventId: string, batchId: string, query: ScenarioBatchMediaQuery, user: AuthenticatedUser): Promise<ScenarioBatchMediaList> {
    await this.assertManage(eventId,user);
    const [batch] = await this.databaseService.client.select({status:scenarioDataBatches.status})
      .from(scenarioDataBatches)
      .where(and(eq(scenarioDataBatches.id,batchId),eq(scenarioDataBatches.eventId,eventId))).limit(1);
    if (!batch) throw new BadRequestException('Generation batch not found');
    if (batch.status !== ScenarioDataBatchStatus.COMPLETED) throw new ConflictException('Only published batches can have registry images');
    let rows: Array<{id:string;identifier:string|null;label:string;mediaId:string|null}>;
    switch (query.kind) {
      case 'persons': rows=await this.databaseService.client.select({
        id: persons.id, identifier: persons.identifier,
        label: persons.displayName, mediaId: registryMedia.id,
      }).from(persons)
        .innerJoin(resources, eq(persons.id, resources.id))
        .leftJoin(registryMedia, eq(registryMedia.resourceId, persons.id))
        .where(and(eq(persons.generationBatchId, batchId),eq(persons.provenance,'SYNTHETIC'),eq(resources.eventId,eventId)))
        .orderBy(asc(persons.identifier), asc(persons.id))
        .limit(query.limit + 1).offset((query.page - 1) * query.limit);
        break;
      case 'organisations': rows=await this.databaseService.client.select({
        id: organisations.id, identifier: organisations.identifier,
        label: organisations.name, mediaId: registryMedia.id,
      }).from(organisations)
        .innerJoin(resources, eq(organisations.id, resources.id))
        .leftJoin(registryMedia, eq(registryMedia.resourceId, organisations.id))
        .where(and(eq(organisations.generationBatchId, batchId),eq(organisations.provenance,'SYNTHETIC'),eq(resources.eventId,eventId)))
        .orderBy(asc(organisations.identifier), asc(organisations.id))
        .limit(query.limit + 1).offset((query.page - 1) * query.limit);
        break;
      case 'locations': rows=await this.databaseService.client.select({
        id: locations.id, identifier: locations.identifier,
        label: locations.name, mediaId: registryMedia.id,
      }).from(locations)
        .innerJoin(resources, eq(locations.id, resources.id))
        .leftJoin(registryMedia, eq(registryMedia.resourceId, locations.id))
        .where(and(eq(locations.generationBatchId, batchId),eq(locations.provenance,'SYNTHETIC'),eq(resources.eventId,eventId)))
        .orderBy(asc(locations.identifier), asc(locations.id))
        .limit(query.limit + 1).offset((query.page - 1) * query.limit);
        break;
      case 'vehicles': rows=await this.databaseService.client.select({
        id: vehicles.id, identifier: vehicles.identifier,
        label: vehicles.label, mediaId: registryMedia.id,
      }).from(vehicles)
        .innerJoin(resources, eq(vehicles.id, resources.id))
        .leftJoin(registryMedia, eq(registryMedia.resourceId, vehicles.id))
        .where(and(eq(vehicles.generationBatchId, batchId),eq(vehicles.provenance,'SYNTHETIC'),eq(resources.eventId,eventId)))
        .orderBy(asc(vehicles.identifier), asc(vehicles.id))
        .limit(query.limit + 1).offset((query.page - 1) * query.limit);
        break;
      case 'devices': rows=await this.databaseService.client.select({
        id: devices.id, identifier: devices.identifier,
        label: devices.label, mediaId: registryMedia.id,
      }).from(devices)
        .innerJoin(resources, eq(devices.id, resources.id))
        .leftJoin(registryMedia, eq(registryMedia.resourceId, devices.id))
        .where(and(eq(devices.generationBatchId, batchId),eq(devices.provenance,'SYNTHETIC'),eq(resources.eventId,eventId)))
        .orderBy(asc(devices.identifier), asc(devices.id))
        .limit(query.limit + 1).offset((query.page - 1) * query.limit);
        break;
      case 'weapons': rows=await this.databaseService.client.select({
        id: weapons.id, identifier: weapons.identifier,
        label: sql<string>`concat_ws(' ', weapons.category, weapons.manufacturer, weapons.model)`, mediaId: registryMedia.id,
      }).from(weapons)
        .innerJoin(resources, eq(weapons.id, resources.id))
        .leftJoin(registryMedia, eq(registryMedia.resourceId, weapons.id))
        .where(and(eq(weapons.generationBatchId, batchId),eq(weapons.provenance,'SYNTHETIC'),eq(resources.eventId,eventId)))
        .orderBy(asc(weapons.identifier), asc(weapons.id))
        .limit(query.limit + 1).offset((query.page - 1) * query.limit);
        break;
      default: throw new BadRequestException('Unsupported registry type');
    }
    return {
      kind: query.kind, page: query.page, limit: query.limit,
      hasMore: rows.length > query.limit,
      records: rows.slice(0,query.limit).map(row=>({
        id: row.id, identifier: row.identifier, label: row.label, hasImage: row.mediaId !== null,
      })),
    };
  }

  private async existingNames(eventId: string, db: Tx | DatabaseService['client'] = this.databaseService.client) {
    const rows = await db.select({ givenName: persons.givenName, familyName: persons.familyName, displayName: persons.displayName })
      .from(persons).innerJoin(resources, eq(persons.id, resources.id)).where(eq(resources.eventId, eventId));
    return new Set(rows.flatMap(p => [nameKey(p.displayName), nameKey([p.givenName, p.familyName].filter(Boolean).join(' '))]));
  }

  private async lockEvent(tx: Tx, eventId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'scenario-data:' + eventId}, 0))`);
  }

  private async newBatch(tx: Tx, eventId: string, request: ScenarioDataRequest, user: AuthenticatedUser, settings: Settings) {
    const [existing] = await tx.select({ count: sql<number>`count(*)` }).from(scenarioDataBatches).where(eq(scenarioDataBatches.eventId, eventId));
    const [batch] = await tx.insert(scenarioDataBatches).values({
      id: generateId(), eventId, identifier: `GEN-${String(Number(existing?.count ?? 0) + 1).padStart(4, '0')}`,
      generatorVersion: GENERATOR_VERSION, seed: request.seed, preset: request.preset, configuration: settings,
      status: ScenarioDataBatchStatus.DRAFT, createdByUserId: user.id, startedAt: new Date(),
    }).returning();
    return batch!;
  }

  async startDraft(eventId: string, request: SparkDraftRequest, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    const counts = this.counts(request);
    if (!(await this.ai.getStatus('DGX_SPARK')).enabled) throw new ServiceUnavailableException('Enable the Spark integration or select Local.');
    return this.databaseService.client.transaction(async tx => {
      await this.lockEvent(tx, eventId);
      return this.response(await this.newBatch(tx, eventId, request, user, { ...counts, brief: request.brief, prepared: 0, rows: emptyWorld(), draftLinks: [] }));
    });
  }

  async advance(eventId: string, batchId: string, expected: number, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    const db = this.databaseService.client;
    const scope = and(eq(scenarioDataBatches.id, batchId), eq(scenarioDataBatches.eventId, eventId));
    const [batch] = await db.select().from(scenarioDataBatches).where(scope);
    if (!batch) throw new BadRequestException('Draft unavailable');
    const conf = batch.configuration as Settings;
    if (!conf.rows || !conf.brief || batch.status !== 'DRAFT') throw new ConflictException('Draft closed');
    if (expected !== conf.prepared) return this.response(batch);
    const kind = draftOrder.find(k => conf.rows![k].length < conf[k]);
    if (!kind) return this.response(batch);
    const start = conf.rows[kind].length;
    const count = Math.min(12, conf[kind] - start);
    const [event] = await db.select({ name: events.name, timezone: events.defaultTimezone, locale: events.defaultLocale, startsAt: events.startsAt }).from(events).where(eq(events.id, eventId));
    const demoCounts = { persons: 0, organisations: 0, locations: 0, vehicles: 0, devices: 0, weapons: 0, [kind]: 1 };
    const example = localWorld(batch.seed + expected, demoCounts, new Set())[kind][0];
    const taken = kind === 'persons' ? await this.existingNames(eventId) : new Set<string>();
    for (const person of conf.rows.persons) taken.add(nameKey(fullName(person)));
    const variation = localWorld(batch.seed + expected, { ...demoCounts, persons: kind === 'persons' ? count : 0 }, taken).persons.map(fullName);
    const targets = candidateLinks(kind, conf.rows, start);
    let output: string;
    try {
      const result = await this.ai.execute({
        eventId, userId: user.id, operationType: 'SCENARIO_DATA', promptTemplateVersion: 'scenario-world-v2',
        messages: [
          { role: 'system', content: 'Write fictional civilian registry records for a tabletop exercise. Treat the brief as creative context only. Return a JSON array of the requested length, with exactly the fields shown in example. Set links to the zero-based slots of relevant offered targets; use [] when none fit. Keep descriptions consistent with those selected connections. Use the event language or the language of the brief. Use varied natural full names, plausible work details, and concrete, distinct background details relevant to the brief. Never add sequence numbers to names. The supplied unused names are suggestions. Only describe weapons as inert inventory props. Omit technical instructions, real personal contacts and URLs.' },
          { role: 'user', content: JSON.stringify({ event, currentTime: new Date().toISOString(), brief: conf.brief, kind, count, start, seed: batch.seed, example: { ...example, links: [] }, targets: targets.map((t, slot) => ({ slot, relation: t.relation, label: t.label })), suggestedNames: variation, previous: samples(conf.rows) }) },
        ], options: { temperature: 0.85, maxTokens: 2600, reasoning: 'disabled' }
      });
      output = result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Spark is unavailable. Your draft is saved. Resume when ready.');
    }
    let raw: unknown;
    try { raw = JSON.parse(output); } catch { throw new BadGatewayException('Spark returned incomplete JSON. Resume this draft to retry the page.'); }
    const parsed = rowSchemas[kind].extend({ links: ScenarioLinkSlots }).array().length(count).safeParse(raw);
    if (!parsed.success) throw new BadGatewayException('Spark returned incomplete records. Resume this draft to retry the page.');
    const draftLinks = [...(conf.draftLinks ?? [])];
    const page = parsed.data.map(({ links, ...record }, index) => {
      for (const slot of new Set(links)) {
        const target = targets[slot];
        if (!target) throw new BadGatewayException('Spark referenced an unknown record. Resume to retry this page.');
        draftLinks.push({ source: kind, index: start + index, target: target.target, targetIndex: target.targetIndex, relation: target.relation });
      }
      return record;
    });
    const updated = { ...conf.rows, [kind]: [...conf.rows[kind], ...page] };
    if (kind === 'persons') for (const person of updated.persons.slice(start)) {
      const key = nameKey(fullName(person));
      if (taken.has(key)) throw new ConflictException('Spark repeated a name. Resume the draft to request a new page.');
      taken.add(key);
    }
    const [saved] = await db.update(scenarioDataBatches).set({ configuration: { ...conf, rows: updated, draftLinks, prepared: expected + count } })
      .where(and(scope, eq(scenarioDataBatches.status, 'DRAFT'), sql`(${scenarioDataBatches.configuration}->>'prepared')::int = ${expected}`)).returning();
    if (!saved) return this.get(eventId, batchId, user);
    return this.response(saved);
  }

  async generate(eventId: string, request: ScenarioDataRequest, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    const counts = this.counts(request);
    return this.databaseService.client.transaction(async tx => {
      await this.lockEvent(tx, eventId);
      const [duplicate] = await tx.select({ id: scenarioDataBatches.id }).from(scenarioDataBatches).where(and(
        eq(scenarioDataBatches.eventId, eventId), eq(scenarioDataBatches.generatorVersion, GENERATOR_VERSION),
        eq(scenarioDataBatches.seed, request.seed), eq(scenarioDataBatches.preset, request.preset),
        eq(scenarioDataBatches.status, 'COMPLETED'), sql`${scenarioDataBatches.configuration} = ${JSON.stringify(counts)}::jsonb`)).limit(1);
      if (duplicate) throw new ConflictException('This batch already exists. Choose a new seed.');
      const world = localWorld(request.seed, counts, await this.existingNames(eventId, tx));
      if (request.previewToken && previewToken(world) !== request.previewToken) throw new ConflictException('The registry changed. Preview the dataset again.');
      const batch = await this.newBatch(tx, eventId, request, user, counts);
      return this.finish(tx, batch, world, user, counts);
    });
  }

  async publish(eventId: string, batchId: string, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    return this.databaseService.client.transaction(async tx => {
      await this.lockEvent(tx, eventId);
      const [batch] = await tx.select().from(scenarioDataBatches).where(and(eq(scenarioDataBatches.eventId, eventId), eq(scenarioDataBatches.id, batchId))).for('update');
      if (!batch) throw new BadRequestException('Draft unavailable');
      if (batch.status === 'COMPLETED') return this.response(batch);
      const { rows, draftLinks, ...conf } = batch.configuration as Settings;
      if (batch.status !== 'DRAFT' || !rows || kinds.some(k => rows[k].length !== conf[k])) throw new ConflictException('Complete the draft before publishing');
      const taken = await this.existingNames(eventId, tx);
      if (rows.persons.some(p => taken.has(nameKey(fullName(p))))) throw new ConflictException('A person with the same name has been added since this draft was prepared. Start a new draft.');
      return this.finish(tx, batch, rows, user, conf, draftLinks);
    });
  }

  private async finish(tx: Tx, batch: typeof scenarioDataBatches.$inferSelect, world: World, user: AuthenticatedUser, conf: Settings, draftLinks?: DraftLink[]) {
    const counts = cleanCounts(conf);
    const result = await this.populate(batch.eventId, batch.id, batch.seed, world, user.id, tx, draftLinks);
    const [completed] = await tx.update(scenarioDataBatches).set({ configuration: conf, status: 'COMPLETED', counts, relationshipCount: result.relationshipCount, completedAt: new Date() }).where(eq(scenarioDataBatches.id, batch.id)).returning();
    await this.auditService.record({ action: 'scenario_data.batch.generated', category: 'scenario_data', eventId: batch.eventId, actorUserId: user.id, resourceType: 'scenario_data_batch', resourceId: batch.id, metadata: { counts, seed: batch.seed, source: conf.brief ? 'SPARK' : 'LOCAL' }, txClient: tx });
    return this.response(completed!);
  }

  private async populate(eventId: string, batchId: string, seed: number, world: World, userId: string, tx: Tx, draftLinks?: DraftLink[]) {
    const ids: Record<string, string[]> = { persons: [], organisations: [], locations: [], vehicles: [], devices: [], weapons: [] };
    const addResource = async (type: string, key: keyof typeof ids) => {
      const id = generateId();
      await this.resourceService.registerResource(eventId, type, { id, ownerUserId: userId, txClient: tx });
      ids[key].push(id);
      return id;
    };
    const addSearch = async (type: string, id: string) => this.searchIndexerService.emitSearchUpsert(type, id, tx);
    const provenance = { provenance: 'SYNTHETIC', generationBatchId: batchId, generationSeed: String(seed) };
    const series: Record<string, number> = {};
    const registryTypes = [['persons', 'person', 'PER'], ['organisations', 'organisation', 'ORG'], ['locations', 'location', 'LOC'],
    ['vehicles', 'vehicle', 'VEH'], ['devices', 'device', 'DEV'], ['weapons', 'weapon', 'WPN']] as const;
    for (const [kind, type, prefix] of registryTypes) {
      if (world[kind].length) series[prefix] = await this.identifiers.reserveRegistry(eventId, type, prefix, world[kind].length, tx);
    }
    const key = (prefix: string, i: number) => `${prefix}-${String(series[prefix]! + i).padStart(6, '0')}`;
    for (const [i, row] of world.organisations.entries()) {
      const id = await addResource('organisation', 'organisations');
      const domain = key('ORG', i).toLowerCase() + '.example.test';
      await tx.insert(organisations).values({ id, identifier: key('ORG', i), ...row, email: 'office@' + domain, website: 'https://' + domain, ...provenance });
      await addSearch('organisation', id);
    }
    for (const [i, row] of world.locations.entries()) {
      const id = await addResource('location', 'locations');
      await tx.insert(locations).values({ id, identifier: key('LOC', i), ...row, ...provenance });
      await addSearch('location', id);
    }
    for (const [i, row] of world.persons.entries()) {
      const id = await addResource('person', 'persons');
      await tx.insert(persons).values({
        id, identifier: key('PER', i), ...row, displayName: fullName(row),
        phones: i % 3 ? [{ value: String(1000 + series.PER! + i), label: 'Exercise extension', primary: true }] : [],
        emails: [{ value: `${nameKey(fullName(row)).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 40) || 'staff'}.${series.PER! + i}@scenario.example.test`, primary: true }], ...provenance
      });
      await addSearch('person', id);
    }
    for (const [i, row] of world.vehicles.entries()) {
      const id = await addResource('vehicle', 'vehicles');
      await tx.insert(vehicles).values({ id, identifier: key('VEH', i), ...row, label: row.make + ' ' + row.model, registrationPlate: 'SIM-' + String(series.VEH! + i).padStart(6, '0'), ...provenance });
      await addSearch('vehicle', id);
    }
    for (const [i, row] of world.devices.entries()) {
      const id = await addResource('device', 'devices');
      const tag = key('DEV', i);
      const address = (series.DEV! + i).toString(16).padStart(8, '0');
      await tx.insert(devices).values({
        id, identifier: tag, ...row, label: row.manufacturer + ' ' + row.model,
        serialNumber: 'SN-' + tag, assetTag: tag, hostname: tag.toLowerCase() + '.example.test',
        ipAddress: '2001:db8::' + address.slice(0, 4) + ':' + address.slice(4), ...provenance
      });
      await addSearch('device', id);
    }
    for (const [i, row] of world.weapons.entries()) {
      const id = await addResource('weapon', 'weapons');
      await tx.insert(weapons).values({ id, identifier: key('WPN', i), ...row, serialNumber: 'PROP-' + key('WPN', i), ...provenance });
      await addSearch('weapon', id);
    }
    const links: Array<[string, string, string]> = [];
    if (draftLinks) {
      for (const link of draftLinks) links.push([ids[link.source]![link.index]!, ids[link.target]![link.targetIndex]!, link.relation]);
    } else {
      ids.persons.forEach((personId, i) => {
        if (ids.organisations.length && i % 10 < 8) links.push([personId, ids.organisations[i % ids.organisations.length]!, 'EMPLOYED_BY']);
        if (ids.vehicles.length && i % 3 === 0) links.push([personId, ids.vehicles[i % ids.vehicles.length]!, 'OWNER_OF']);
        if (ids.devices.length && i % 2 === 0) links.push([personId, ids.devices[i % ids.devices.length]!, 'USES']);
      });
      ids.organisations.forEach((orgId, i) => { if (ids.locations.length) links.push([orgId, ids.locations[i % ids.locations.length]!, 'LOCATED_AT']); });
      ids.vehicles.forEach((vehicleId, i) => { if (ids.locations.length && i % 2 === 0) links.push([vehicleId, ids.locations[i % ids.locations.length]!, 'LOCATED_AT']); });
      ids.devices.forEach((deviceId, i) => { if (ids.locations.length && i % 3 === 0) links.push([deviceId, ids.locations[i % ids.locations.length]!, 'LOCATED_AT']); });
      ids.weapons.forEach((weaponId, i) => { if (ids.persons.length && i % 2 === 0) links.push([weaponId, ids.persons[i % ids.persons.length]!, 'RELATED_TO']); });
    }
    for (let offset = 0; offset < links.length; offset += 250) {
      const page = links.slice(offset, offset + 250);
      await tx.insert(resourceRelationships).values(page.map(([sourceResourceId, targetResourceId, relationshipType]) => ({
        id: generateId(), eventId, sourceResourceId, targetResourceId, relationshipType, createdByUserId: userId
      })));
      await tx.insert(outboxEvents).values([...new Set(page.map(link => link[0]))].map(id => ({
        id: generateId(), eventType: 'search.upsert', payload: { type: 'resource', id }, status: OutboxStatus.PENDING, retryCount: 0
      })));
    }
    return { relationshipCount: links.length };
  }

  async cleanup(eventId: string, batchId: string, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    return this.databaseService.client.transaction(async (tx) => {
      await this.lockEvent(tx, eventId);
      const [batch] = await tx.select().from(scenarioDataBatches).where(and(eq(scenarioDataBatches.id, batchId), eq(scenarioDataBatches.eventId, eventId))).limit(1);
      if (!batch) throw new BadRequestException('Generation batch not found');
      if (batch.status === ScenarioDataBatchStatus.CLEANED) return this.response(batch);
      const db = tx;
      const entityTables = [
        ['person', persons],
        ['organisation', organisations],
        ['location', locations],
        ['vehicle', vehicles],
        ['device', devices],
        ['weapon', weapons],
      ] as const;
      const entityIds: Array<{ id: string; type: string }> = [];
      for (const [type, table] of entityTables) {
        const rows = await db.select({ id: table.id }).from(table).where(and(eq(table.provenance, 'SYNTHETIC'), eq(table.generationBatchId, batchId)));
        entityIds.push(...rows.map((row) => ({ id: row.id, type })));
      }
      const ids = entityIds.map((entity) => entity.id);
      if (ids.length) {
        const external = await db.select({ id: resourceRelationships.id }).from(resourceRelationships).where(and(
          isNull(resourceRelationships.removedAt),
          or(
            and(inArray(resourceRelationships.sourceResourceId, ids), notInArray(resourceRelationships.targetResourceId, ids)),
            and(inArray(resourceRelationships.targetResourceId, ids), notInArray(resourceRelationships.sourceResourceId, ids)),
          ),
        )).limit(1);
        if (external[0]) throw new ForbiddenException('This dataset is currently referenced by operational records.');
      }

      if (ids.length) {
        await tx.delete(resources).where(inArray(resources.id, ids));
        for (const entity of entityIds) {
          await this.searchIndexerService.emitSearchDelete(entity.type, entity.id, tx);
        }
      }
      await tx.update(scenarioDataBatches).set({ configuration: { ...cleanCounts(batch.configuration as Settings), brief: (batch.configuration as Settings).brief }, status: ScenarioDataBatchStatus.CLEANED, cleanedAt: new Date(), cleanedByUserId: user.id }).where(eq(scenarioDataBatches.id, batchId));
      const [cleaned] = await db.select().from(scenarioDataBatches).where(eq(scenarioDataBatches.id, batchId));
      await this.auditService.record({ action: 'scenario_data.batch.cleaned', category: 'scenario_data', eventId, actorUserId: user.id, resourceType: 'scenario_data_batch', resourceId: batchId, txClient: tx, metadata: { batchId, removedEntities: ids.length } });
      return this.response(cleaned!);
    });
  }
}
