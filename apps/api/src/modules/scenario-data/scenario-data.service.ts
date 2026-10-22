import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  scenarioDataBatches,
  ScenarioDataBatchStatus,
  persons,
  organisations,
  locations,
  vehicles,
  devices,
  weapons,
  resources,
  resourceRelationships,
  outboxEvents,
  OutboxStatus,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type { ScenarioDataCounts, ScenarioDataRequest, ScenarioDataPreview, ScenarioDataBatchResponse } from '@cyris/contracts';

const GENERATOR_VERSION = 1;
const PRESETS: Record<string, ScenarioDataCounts> = {
  SMALL: { persons: 40, organisations: 6, locations: 12, vehicles: 20, devices: 25, weapons: 5 },
  STANDARD: { persons: 250, organisations: 35, locations: 60, vehicles: 120, devices: 180, weapons: 40 },
  LARGE: { persons: 800, organisations: 100, locations: 150, vehicles: 350, devices: 500, weapons: 100 },
};

type Tx = Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];

class SeededWorld {
  private state: number;
  constructor(seed: number) {
    this.state = (seed | 0) ^ 0x9e3779b9;
  }
  next(): number {
    this.state = Math.imul(this.state ^ (this.state >>> 16), 2246822507);
    this.state = Math.imul(this.state ^ (this.state >>> 13), 3266489909);
    return (this.state ^= this.state >>> 16) >>> 0;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.next() % items.length]!;
  }
  chance(percent: number): boolean {
    return this.next() % 100 < percent;
  }
}

const firstNames = ['Jan', 'Petra', 'Alicja', 'Lukas', 'Martin', 'Katarína', 'Marek', 'Eva'];
const lastNames = ['Novák', 'Svobodová', 'Kowalski', 'Weber', 'Horák', 'Müller', 'Dvořák', 'Kral'];
const cities = ['Brno', 'Ostrava', 'Olomouc', 'Wrocław', 'Dresden', 'Bratislava', 'Plzeň'];
const makes = [['Škoda', 'Octavia'], ['Volkswagen', 'Transporter'], ['Ford', 'Transit'], ['Tatra', 'Phoenix']];
const devicesCatalog = [['Laptop', 'Dell', 'Latitude'], ['Workstation', 'Lenovo', 'ThinkPad'], ['Router', 'MikroTik', 'RouterBoard'], ['Tablet', 'Samsung', 'Tab']];
const weaponCatalog = ['Training Handgun', 'Inert Carbine', 'Training Device'];
const orgKinds = ['Logistics', 'Systems', 'Manufacturing', 'Laboratory', 'Transport'];
const relationshipTypes = ['EMPLOYED_BY', 'LOCATED_AT', 'OWNER_OF', 'USES', 'OPERATES'] as const;

@Injectable()
export class ScenarioDataService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceService: ResourceService,
    private readonly identifierAllocator: IdentifierAllocatorService,
    private readonly searchIndexerService: SearchIndexerService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

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
    return counts;
  }

  private response(row: typeof scenarioDataBatches.$inferSelect): ScenarioDataBatchResponse {
    return {
      id: row.id, eventId: row.eventId, identifier: row.identifier, generatorVersion: row.generatorVersion,
      seed: row.seed, preset: row.preset as ScenarioDataBatchResponse['preset'],
      configuration: row.configuration as ScenarioDataCounts, status: row.status,
      counts: row.counts as ScenarioDataCounts | null, relationshipCount: row.relationshipCount,
      createdByUserId: row.createdByUserId, createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null,
      cleanedAt: row.cleanedAt?.toISOString() ?? null, failureMessage: row.failureMessage,
    };
  }

  async preview(eventId: string, request: ScenarioDataRequest, user: AuthenticatedUser): Promise<ScenarioDataPreview> {
    await this.assertManage(eventId, user);
    const counts = this.counts(request);
    const world = new SeededWorld(request.seed);
    const sample = (make: (index: number) => string) => Array.from({ length: 4 }, (_, index) => make(index));
    const countMatching = (count: number, predicate: (index: number) => boolean) =>
      Array.from({ length: count }, (_, index) => index).filter(predicate).length;
    const estimatedRelationships =
      countMatching(counts.persons, (index) => index % 10 < 8) +
      countMatching(counts.persons, (index) => index % 3 === 0) +
      countMatching(counts.persons, (index) => index % 2 === 0) +
      counts.organisations +
      countMatching(counts.vehicles, (index) => index % 2 === 0) +
      countMatching(counts.devices, (index) => index % 3 === 0) +
      countMatching(counts.weapons, (index) => index % 2 === 0);
    return {
      counts,
      estimatedRelationships,
      samples: {
        persons: sample((i) => `${world.pick(firstNames)} ${world.pick(lastNames)} ${i + 1}`),
        organisations: sample((i) => `Asterion ${world.pick(orgKinds)} ${i + 1}`),
        locations: sample((i) => `${world.pick(['North', 'Central', 'Riverside', 'West'])} ${world.pick(['Warehouse', 'Office', 'Laboratory'])}`),
        vehicles: sample(() => `${world.pick(makes)[0]} ${world.pick(makes)[1]}`),
        devices: sample(() => `${world.pick(devicesCatalog)[1]} ${world.pick(devicesCatalog)[2]}`),
        weapons: sample(() => world.pick(weaponCatalog)),
      },
    };
  }

  async list(eventId: string, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    const rows = await this.databaseService.client.select().from(scenarioDataBatches)
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

  async generate(eventId: string, request: ScenarioDataRequest, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    const counts = this.counts(request);
    const duplicate = await this.databaseService.client.select().from(scenarioDataBatches).where(and(
      eq(scenarioDataBatches.eventId, eventId),
      eq(scenarioDataBatches.generatorVersion, GENERATOR_VERSION),
      eq(scenarioDataBatches.seed, request.seed),
      eq(scenarioDataBatches.preset, request.preset),
      sql`${scenarioDataBatches.configuration} = ${JSON.stringify(counts)}::jsonb`,
      or(eq(scenarioDataBatches.status, ScenarioDataBatchStatus.GENERATING), eq(scenarioDataBatches.status, ScenarioDataBatchStatus.COMPLETED)),
    )).limit(1);
    if (duplicate[0]) throw new ConflictException('An identical generation batch already exists');

    const batchId = generateId();
    const existingCount = (await this.databaseService.client.select({ count: sql<number>`count(*)` }).from(scenarioDataBatches).where(eq(scenarioDataBatches.eventId, eventId)))[0]?.count ?? 0;
    const [batch] = await this.databaseService.client.insert(scenarioDataBatches).values({
      id: batchId, eventId, identifier: `GEN-${String(Number(existingCount) + 1).padStart(4, '0')}`,
      generatorVersion: GENERATOR_VERSION, seed: request.seed, preset: request.preset,
      configuration: counts, status: ScenarioDataBatchStatus.GENERATING, createdByUserId: user.id, startedAt: new Date(),
    }).returning();

    try {
      const result = await this.databaseService.client.transaction(async (tx) => this.populate(eventId, batchId, request.seed, counts, user.id, tx));
      const [completed] = await this.databaseService.client.update(scenarioDataBatches).set({
        status: ScenarioDataBatchStatus.COMPLETED, counts, relationshipCount: result.relationshipCount, completedAt: new Date(),
      }).where(eq(scenarioDataBatches.id, batchId)).returning();
      await this.auditService.record({ action: 'scenario_data.batch.generated', category: 'scenario_data', eventId, actorUserId: user.id, resourceType: 'scenario_data_batch', resourceId: batchId, metadata: { batchId, seed: request.seed, counts, relationshipCount: result.relationshipCount, generatorVersion: GENERATOR_VERSION } });
      return this.response(completed!);
    } catch (error) {
      await this.databaseService.client.update(scenarioDataBatches).set({ status: ScenarioDataBatchStatus.FAILED, failureMessage: 'Generation failed; no incomplete dataset was retained.' }).where(eq(scenarioDataBatches.id, batchId));
      throw error;
    }
  }

  private async populate(eventId: string, batchId: string, seed: number, counts: ScenarioDataCounts, userId: string, tx: Tx) {
    const world = new SeededWorld(seed);
    const ids: Record<string, string[]> = { persons: [], organisations: [], locations: [], vehicles: [], devices: [], weapons: [] };
    const addResource = async (type: string, key: keyof typeof ids) => {
      const id = generateId();
      await this.resourceService.registerResource(eventId, type, { id, ownerUserId: userId, txClient: tx });
      ids[key].push(id);
      return id;
    };
    const addSearch = async (type: string, id: string) => this.searchIndexerService.emitSearchUpsert(type, id, tx);
    for (let i = 0; i < counts.organisations; i++) {
      const id = await addResource('organisation', 'organisations');
      const name = `Asterion ${world.pick(orgKinds)} ${String(i + 1).padStart(3, '0')}`;
      const identifier = await this.identifierAllocator.allocate(eventId, 'organisation', 'ORG', tx, 6);
      await tx.insert(organisations).values({ id, identifier, name, shortName: `Asterion ${i + 1}`, aliases: [], email: `org-${i + 1}@scenario.example.test`, phone: '+420 700 000 000', website: 'https://scenario.example.test', provenance: 'SYNTHETIC', generationBatchId: batchId, generationSeed: String(seed) });
      await addSearch('organisation', id);
    }
    for (let i = 0; i < counts.locations; i++) {
      const id = await addResource('location', 'locations');
      const identifier = await this.identifierAllocator.allocate(eventId, 'location', 'LOC', tx, 6);
      await tx.insert(locations).values({ id, identifier, name: `${world.pick(['North', 'Central', 'Riverside', 'West'])} ${world.pick(['Warehouse', 'Office', 'Laboratory'])} ${i + 1}`, city: world.pick(cities), country: 'Fictional Central Europe', locationType: world.pick(['warehouse', 'office', 'laboratory']), provenance: 'SYNTHETIC', generationBatchId: batchId, generationSeed: String(seed) });
      await addSearch('location', id);
    }
    for (let i = 0; i < counts.persons; i++) {
      const id = await addResource('person', 'persons');
      const givenName = world.pick(firstNames); const familyName = world.pick(lastNames);
      const identifier = await this.identifierAllocator.allocate(eventId, 'person', 'PER', tx, 6);
      await tx.insert(persons).values({ id, identifier, displayName: `${givenName} ${familyName} ${i + 1}`, givenName, familyName, nationality: world.pick(['Czech', 'Polish', 'German', 'Slovak']), emails: world.chance(80) ? [{ value: `person-${i + 1}@scenario.example.test`, primary: true }] : [], phones: world.chance(65) ? [{ value: `+420 700 ${String(i).padStart(6, '0')}`, primary: true }] : [], aliases: world.chance(10) ? [`${givenName} QA`] : [], provenance: 'SYNTHETIC', generationBatchId: batchId, generationSeed: String(seed) });
      await addSearch('person', id);
    }
    for (let i = 0; i < counts.vehicles; i++) {
      const id = await addResource('vehicle', 'vehicles'); const identifier = await this.identifierAllocator.allocate(eventId, 'vehicle', 'VEH', tx, 6); const make = world.pick(makes);
      await tx.insert(vehicles).values({ id, identifier, label: `${make[0]} ${make[1]} ${i + 1}`, registrationPlate: `SCN-${String(i + 1).padStart(5, '0')}`, make: make[0], model: make[1], variant: 'Scenario', modelYear: String(2018 + (world.next() % 8)), colour: world.pick(['White', 'Blue', 'Grey', 'Black']), provenance: 'SYNTHETIC', generationBatchId: batchId, generationSeed: String(seed) });
      await addSearch('vehicle', id);
    }
    for (let i = 0; i < counts.devices; i++) {
      const id = await addResource('device', 'devices'); const identifier = await this.identifierAllocator.allocate(eventId, 'device', 'DEV', tx, 6); const device = world.pick(devicesCatalog);
      await tx.insert(devices).values({ id, identifier, label: `${device[0]} ${i + 1}`, deviceType: device[0].toUpperCase().replace(' ', '_'), manufacturer: device[1], model: device[2], serialNumber: `SCN-DEV-${String(i + 1).padStart(5, '0')}`, assetTag: `SCN-ASSET-${String(i + 1).padStart(5, '0')}`, hostname: `scn-${String(i + 1).padStart(4, '0')}`, operatingSystem: 'Scenario OS', ipAddress: `192.0.2.${(i % 254) + 1}`, provenance: 'SYNTHETIC', generationBatchId: batchId, generationSeed: String(seed) });
      await addSearch('device', id);
    }
    for (let i = 0; i < counts.weapons; i++) {
      const id = await addResource('weapon', 'weapons'); const identifier = await this.identifierAllocator.allocate(eventId, 'weapon', 'WPN', tx, 6);
      await tx.insert(weapons).values({ id, identifier, category: world.pick(weaponCatalog), manufacturer: `Scenario Manufacturer ${i + 1}`, model: `Training Model ${i + 1}`, serialNumber: `SCN-WPN-${String(i + 1).padStart(5, '0')}`, calibre: 'Training / inert descriptor', provenance: 'SYNTHETIC', generationBatchId: batchId, generationSeed: String(seed) });
      await addSearch('weapon', id);
    }
    const links: Array<[string, string, string]> = [];
    ids.persons.forEach((personId, i) => {
      if (ids.organisations.length && i % 10 < 8) links.push([personId, ids.organisations[i % ids.organisations.length]!, 'EMPLOYED_BY']);
      if (ids.vehicles.length && i % 3 === 0) links.push([personId, ids.vehicles[i % ids.vehicles.length]!, 'OWNER_OF']);
      if (ids.devices.length && i % 2 === 0) links.push([personId, ids.devices[i % ids.devices.length]!, 'USES']);
    });
    ids.organisations.forEach((orgId, i) => { if (ids.locations.length) links.push([orgId, ids.locations[i % ids.locations.length]!, 'LOCATED_AT']); });
    ids.vehicles.forEach((vehicleId, i) => { if (ids.locations.length && i % 2 === 0) links.push([vehicleId, ids.locations[i % ids.locations.length]!, 'LOCATED_AT']); });
    ids.devices.forEach((deviceId, i) => { if (ids.locations.length && i % 3 === 0) links.push([deviceId, ids.locations[i % ids.locations.length]!, 'LOCATED_AT']); });
    ids.weapons.forEach((weaponId, i) => { if (ids.persons.length && i % 2 === 0) links.push([weaponId, ids.persons[i % ids.persons.length]!, 'RELATED_TO']); });
    for (const [sourceResourceId, targetResourceId, relationshipType] of links) {
      await tx.insert(resourceRelationships).values({ id: generateId(), eventId, sourceResourceId, targetResourceId, relationshipType, createdByUserId: userId });
      await tx.insert(outboxEvents).values({ id: generateId(), eventType: 'search.upsert', payload: { type: 'resource', id: sourceResourceId }, status: OutboxStatus.PENDING, retryCount: 0 });
    }
    return { relationshipCount: links.length };
  }

  async cleanup(eventId: string, batchId: string, user: AuthenticatedUser) {
    await this.assertManage(eventId, user);
    const [batch] = await this.databaseService.client.select().from(scenarioDataBatches).where(and(eq(scenarioDataBatches.id, batchId), eq(scenarioDataBatches.eventId, eventId))).limit(1);
    if (!batch) throw new BadRequestException('Generation batch not found');
    if (batch.status === ScenarioDataBatchStatus.CLEANED) return this.response(batch);
    const db = this.databaseService.client;
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
    await db.transaction(async (tx) => {
      if (ids.length) {
        await tx.delete(resources).where(inArray(resources.id, ids));
        for (const entity of entityIds) {
          await this.searchIndexerService.emitSearchDelete(entity.type, entity.id, tx);
        }
      }
      await tx.update(scenarioDataBatches).set({ status: ScenarioDataBatchStatus.CLEANED, cleanedAt: new Date(), cleanedByUserId: user.id }).where(eq(scenarioDataBatches.id, batchId));
    });
    const [cleaned] = await db.select().from(scenarioDataBatches).where(eq(scenarioDataBatches.id, batchId));
    await this.auditService.record({ action: 'scenario_data.batch.cleaned', category: 'scenario_data', eventId, actorUserId: user.id, resourceType: 'scenario_data_batch', resourceId: batchId, metadata: { batchId, removedEntities: ids.length } });
    return this.response(cleaned!);
  }
}
