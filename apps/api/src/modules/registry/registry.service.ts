import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  persons,
  organisations,
  locations,
  vehicles,
  devices,
  weapons,
  registryMedia,
  resources,
  type ResourceVisibilityValue,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type {
  CreatePersonRequest,
  UpdatePersonRequest,
  PersonResponse,
  CreateOrganisationRequest,
  UpdateOrganisationRequest,
  OrganisationResponse,
  CreateLocationRequest,
  UpdateLocationRequest,
  LocationResponse,
  CreateVehicleRequest,
  UpdateVehicleRequest,
  VehicleResponse,
  CreateDeviceRequest,
  UpdateDeviceRequest,
  DeviceResponse,
  CreateWeaponRequest,
  UpdateWeaponRequest,
  WeaponResponse,
} from '@cyris/contracts';

@Injectable()
export class RegistryService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly searchIndexerService: SearchIndexerService,
    private readonly identifierAllocator: IdentifierAllocatorService
    , private readonly storageService: StorageService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async uploadPrimaryMedia(resourceId: string, payload: { filename?: string; mimeType?: string; data?: string }, user: AuthenticatedUser) {
    await this.resourceAccessService.assertCanAccessResource(user, resourceId, Permissions.REGISTRY_UPDATE);
    if (!payload.filename || !payload.data || !payload.mimeType?.startsWith('image/')) {
      throw new BadRequestException('An image filename, MIME type, and base64 data are required');
    }
    const data = Buffer.from(payload.data, 'base64');
    if (data.byteLength > 5 * 1024 * 1024) throw new BadRequestException('Registry images must be 5 MB or smaller');
    const key = `registry/${resourceId}/primary-${Date.now()}-${payload.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const stored = await this.storageService.putObject(key, data, payload.mimeType);
    const [previous] = await this.db.select().from(registryMedia).where(eq(registryMedia.resourceId, resourceId)).limit(1);
    await this.db.insert(registryMedia).values({
      id: generateId(),
      resourceId,
      objectKey: stored.key,
      bucket: stored.bucket,
      filename: payload.filename,
      mimeType: payload.mimeType,
      byteSize: String(data.byteLength),
    }).onConflictDoUpdate({
      target: registryMedia.resourceId,
      set: {
        objectKey: stored.key,
        bucket: stored.bucket,
        filename: payload.filename,
        mimeType: payload.mimeType,
        byteSize: String(data.byteLength),
        updatedAt: new Date(),
      },
    });
    if (previous && previous.objectKey !== stored.key) await this.storageService.deleteObject(previous.objectKey, previous.bucket);
    return { filename: payload.filename, mimeType: payload.mimeType, byteSize: data.byteLength };
  }

  async getPrimaryMedia(resourceId: string, user: AuthenticatedUser) {
    await this.resourceAccessService.assertCanAccessResource(user, resourceId, Permissions.REGISTRY_READ);
    const [media] = await this.db.select().from(registryMedia).where(eq(registryMedia.resourceId, resourceId)).limit(1);
    if (!media) return null;
    const object = await this.storageService.getObject(media.objectKey, media.bucket);
    return { ...object, mimeType: media.mimeType, filename: media.filename };
  }

  async removePrimaryMedia(resourceId: string, user: AuthenticatedUser) {
    await this.resourceAccessService.assertCanAccessResource(user, resourceId, Permissions.REGISTRY_UPDATE);
    const [media] = await this.db.delete(registryMedia).where(eq(registryMedia.resourceId, resourceId)).returning();
    if (media) await this.storageService.deleteObject(media.objectKey, media.bucket);
    return { success: true };
  }

  // ============================================================================
  // Persons
  // ============================================================================

  async listPersons(eventId: string, user: AuthenticatedUser): Promise<PersonResponse[]> {
    const rows = await this.db
      .select({
        person: persons,
        resource: resources,
      })
      .from(persons)
      .innerJoin(resources, eq(persons.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(persons.createdAt));

    const accessible: PersonResponse[] = [];
    for (const r of rows) {
      const canAccess = await this.resourceAccessService.canAccessResource(
        user,
        r.person.id,
        Permissions.REGISTRY_READ
      );
      if (canAccess) {
        accessible.push({
          id: r.person.id,
          identifier: r.person.identifier,
          eventId: r.resource.eventId,
          displayName: r.person.displayName,
          givenName: r.person.givenName,
          familyName: r.person.familyName,
          dateOfBirth: r.person.dateOfBirth,
          nationality: r.person.nationality,
          middleName: r.person.middleName,
          emails: r.person.emails,
          phones: r.person.phones,
          description: r.person.description,
          status: r.person.status,
          provenance: r.person.provenance,
          generationBatchId: r.person.generationBatchId,
          generationSeed: r.person.generationSeed,
          aliases: (r.person.aliases as string[]) || [],
          visibility: r.resource.visibility,
          owningUnitId: r.resource.owningUnitId,
          createdAt: r.person.createdAt.toISOString(),
          updatedAt: r.person.updatedAt.toISOString(),
        });
      }
    }
    return accessible;
  }

  async createPerson(
    eventId: string,
    data: CreatePersonRequest,
    user: AuthenticatedUser
  ): Promise<PersonResponse> {
    const personId = generateId();

    return this.db.transaction(async (tx) => {
      const identifier = await this.identifierAllocator.allocate(eventId, 'person', 'PER', tx, 6);
      // 1. Create base resource with matching UUID
      await this.resourceService.registerResource(eventId, 'person', {
        id: personId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 2. Insert domain row with identical UUID
      const [created] = await tx
        .insert(persons)
        .values({
          id: personId,
          identifier,
          displayName: data.displayName,
          givenName: data.givenName ?? null,
          familyName: data.familyName ?? null,
          dateOfBirth: data.dateOfBirth ?? null,
          nationality: data.nationality ?? null,
          description: data.description ?? null,
          status: data.status,
          middleName: data.middleName ?? null,
          emails: data.emails ?? [],
          phones: data.phones ?? [],
          provenance: data.provenance ?? 'MANUAL',
          generationBatchId: data.generationBatchId ?? null,
          generationSeed: data.generationSeed ?? null,
          aliases: data.aliases ?? [],
        })
        .returning();

      // 3. Audit
      await this.auditService.record({
        action: 'registry.person.created',
        category: 'registry',
        eventId,
        resourceType: 'person',
        resourceId: personId,
        actorUserId: user.id,
        metadata: { displayName: data.displayName, status: data.status },
      });

      // 4. Activity
      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: personId,
          activityType: 'registry.person.created',
          actorUserId: user.id,
          title: `Registered persona '${data.displayName}'`,
          summary: data.description ?? undefined,
          visibility: data.visibility,
        },
        tx
      );

      // 5. Search outbox
      await this.searchIndexerService.emitSearchUpsert('person', personId, tx);

      return {
        id: created!.id,
        identifier: created!.identifier,
        eventId,
        displayName: created!.displayName,
        givenName: created!.givenName,
        familyName: created!.familyName,
        dateOfBirth: created!.dateOfBirth,
        nationality: created!.nationality,
        middleName: created!.middleName,
        emails: created!.emails,
        phones: created!.phones,
        description: created!.description,
        status: created!.status,
        aliases: (created!.aliases as string[]) || [],
        visibility: data.visibility || 'EVENT',
        owningUnitId: data.owningUnitId,
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      };
    });
  }

  async getPerson(
    eventId: string,
    personId: string,
    user: AuthenticatedUser
  ): Promise<PersonResponse> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      personId,
      Permissions.REGISTRY_READ
    );

    const [row] = await this.db
      .select({ person: persons, resource: resources })
      .from(persons)
      .innerJoin(resources, eq(persons.id, resources.id))
      .where(eq(persons.id, personId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Person '${personId}' not found`);
    }

    return {
      id: row.person.id,
      identifier: row.person.identifier,
      eventId: row.resource.eventId,
      displayName: row.person.displayName,
      givenName: row.person.givenName,
      familyName: row.person.familyName,
      dateOfBirth: row.person.dateOfBirth,
      nationality: row.person.nationality,
      middleName: row.person.middleName,
      emails: row.person.emails,
      phones: row.person.phones,
      description: row.person.description,
      status: row.person.status,
      aliases: (row.person.aliases as string[]) || [],
      visibility: row.resource.visibility,
      owningUnitId: row.resource.owningUnitId,
      createdAt: row.person.createdAt.toISOString(),
      updatedAt: row.person.updatedAt.toISOString(),
    };
  }

  async updatePerson(
    eventId: string,
    personId: string,
    data: UpdatePersonRequest,
    user: AuthenticatedUser
  ): Promise<PersonResponse> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      personId,
      Permissions.REGISTRY_UPDATE
    );

    const existing = await this.getPerson(eventId, personId, user);

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (data.displayName !== undefined) updatePayload.displayName = data.displayName;
    if (data.givenName !== undefined) updatePayload.givenName = data.givenName;
    if (data.familyName !== undefined) updatePayload.familyName = data.familyName;
    if (data.middleName !== undefined) updatePayload.middleName = data.middleName;
    if (data.dateOfBirth !== undefined) updatePayload.dateOfBirth = data.dateOfBirth;
    if (data.nationality !== undefined) updatePayload.nationality = data.nationality;
    if (data.emails !== undefined) updatePayload.emails = data.emails;
    if (data.phones !== undefined) updatePayload.phones = data.phones;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.aliases !== undefined) updatePayload.aliases = data.aliases;

    const [updated] = await this.db
      .update(persons)
      .set(updatePayload)
      .where(eq(persons.id, personId))
      .returning();

    await this.auditService.record({
      action: 'registry.person.updated',
      category: 'registry',
      eventId,
      resourceType: 'person',
      resourceId: personId,
      actorUserId: user.id,
      metadata: { displayName: updated!.displayName },
    });

    await this.searchIndexerService.emitSearchUpsert('person', personId);

    return {
      ...existing,
      ...updated!,
      aliases: (updated!.aliases as string[]) || [],
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }

  // ============================================================================
  // Organisations
  // ============================================================================

  async listOrganisations(eventId: string, user: AuthenticatedUser): Promise<OrganisationResponse[]> {
    const rows = await this.db
      .select({ org: organisations, resource: resources })
      .from(organisations)
      .innerJoin(resources, eq(organisations.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(organisations.createdAt));

    const accessible: OrganisationResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.org.id, Permissions.REGISTRY_READ)) {
        accessible.push({
          id: r.org.id,
          identifier: r.org.identifier,
          eventId: r.resource.eventId,
          name: r.org.name,
          shortName: r.org.shortName,
          aliases: r.org.aliases,
          legalName: r.org.legalName,
          registrationNumber: r.org.registrationNumber,
          email: r.org.email,
          phone: r.org.phone,
          website: r.org.website,
          description: r.org.description,
          status: r.org.status,
          provenance: r.org.provenance,
          generationBatchId: r.org.generationBatchId,
          generationSeed: r.org.generationSeed,
          visibility: r.resource.visibility,
          owningUnitId: r.resource.owningUnitId,
          createdAt: r.org.createdAt.toISOString(),
          updatedAt: r.org.updatedAt.toISOString(),
        });
      }
    }
    return accessible;
  }

  async createOrganisation(
    eventId: string,
    data: CreateOrganisationRequest,
    user: AuthenticatedUser
  ): Promise<OrganisationResponse> {
    const orgId = generateId();

    return this.db.transaction(async (tx) => {
      const identifier = await this.identifierAllocator.allocate(eventId, 'organisation', 'ORG', tx, 6);
      await this.resourceService.registerResource(eventId, 'organisation', {
        id: orgId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      const [created] = await tx
        .insert(organisations)
        .values({
          id: orgId,
          identifier,
          name: data.name,
          shortName: data.shortName ?? null,
          aliases: data.aliases ?? [],
          legalName: data.legalName ?? null,
          registrationNumber: data.registrationNumber ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          website: data.website ?? null,
          provenance: data.provenance ?? 'MANUAL',
          generationBatchId: data.generationBatchId ?? null,
          generationSeed: data.generationSeed ?? null,
          description: data.description ?? null,
          status: data.status,
        })
        .returning();

      await this.auditService.record({
        action: 'registry.organisation.created',
        category: 'registry',
        eventId,
        resourceType: 'organisation',
        resourceId: orgId,
        actorUserId: user.id,
        metadata: { name: data.name },
      });

      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: orgId,
          activityType: 'registry.organisation.created',
          actorUserId: user.id,
          title: `Registered organisation '${data.name}'`,
          summary: data.description ?? undefined,
          visibility: data.visibility,
        },
        tx
      );

      await this.searchIndexerService.emitSearchUpsert('organisation', orgId, tx);

      return {
        id: created!.id,
        identifier: created!.identifier,
        eventId,
        name: created!.name,
        legalName: created!.legalName,
        registrationNumber: created!.registrationNumber,
        description: created!.description,
        status: created!.status,
        visibility: data.visibility || 'EVENT',
        owningUnitId: data.owningUnitId,
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      };
    });
  }

  async getOrganisation(
    eventId: string,
    orgId: string,
    user: AuthenticatedUser
  ): Promise<OrganisationResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, orgId, Permissions.REGISTRY_READ);

    const [row] = await this.db
      .select({ org: organisations, resource: resources })
      .from(organisations)
      .innerJoin(resources, eq(organisations.id, resources.id))
      .where(eq(organisations.id, orgId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Organisation '${orgId}' not found`);
    }

    return {
      id: row.org.id,
      identifier: row.org.identifier,
      eventId: row.resource.eventId,
      name: row.org.name,
      shortName: row.org.shortName,
      aliases: row.org.aliases,
      legalName: row.org.legalName,
      registrationNumber: row.org.registrationNumber,
      email: row.org.email,
      phone: row.org.phone,
      website: row.org.website,
      description: row.org.description,
      status: row.org.status,
      visibility: row.resource.visibility,
      owningUnitId: row.resource.owningUnitId,
      createdAt: row.org.createdAt.toISOString(),
      updatedAt: row.org.updatedAt.toISOString(),
    };
  }

  async updateOrganisation(
    eventId: string,
    orgId: string,
    data: UpdateOrganisationRequest,
    user: AuthenticatedUser
  ): Promise<OrganisationResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, orgId, Permissions.REGISTRY_UPDATE);

    const existing = await this.getOrganisation(eventId, orgId, user);

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.shortName !== undefined) updatePayload.shortName = data.shortName;
    if (data.aliases !== undefined) updatePayload.aliases = data.aliases;
    if (data.legalName !== undefined) updatePayload.legalName = data.legalName;
    if (data.registrationNumber !== undefined) updatePayload.registrationNumber = data.registrationNumber;
    if (data.email !== undefined) updatePayload.email = data.email;
    if (data.phone !== undefined) updatePayload.phone = data.phone;
    if (data.website !== undefined) updatePayload.website = data.website;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.status !== undefined) updatePayload.status = data.status;

    const [updated] = await this.db
      .update(organisations)
      .set(updatePayload)
      .where(eq(organisations.id, orgId))
      .returning();

    await this.auditService.record({
      action: 'registry.organisation.updated',
      category: 'registry',
      eventId,
      resourceType: 'organisation',
      resourceId: orgId,
      actorUserId: user.id,
      metadata: { name: updated!.name },
    });

    await this.searchIndexerService.emitSearchUpsert('organisation', orgId);

    return {
      ...existing,
      ...updated!,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }

  // ============================================================================
  // Locations
  // ============================================================================

  async listLocations(eventId: string, user: AuthenticatedUser): Promise<LocationResponse[]> {
    const rows = await this.db
      .select({ loc: locations, resource: resources })
      .from(locations)
      .innerJoin(resources, eq(locations.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(locations.createdAt));

    const accessible: LocationResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.loc.id, Permissions.REGISTRY_READ)) {
        accessible.push({
          id: r.loc.id,
          identifier: r.loc.identifier,
          eventId: r.resource.eventId,
          name: r.loc.name,
          description: r.loc.description,
          addressText: r.loc.addressText,
          locationType: r.loc.locationType,
          city: r.loc.city,
          region: r.loc.region,
          country: r.loc.country,
          postalCode: r.loc.postalCode,
          latitude: r.loc.latitude,
          longitude: r.loc.longitude,
          provenance: r.loc.provenance,
          generationBatchId: r.loc.generationBatchId,
          generationSeed: r.loc.generationSeed,
          visibility: r.resource.visibility,
          owningUnitId: r.resource.owningUnitId,
          createdAt: r.loc.createdAt.toISOString(),
          updatedAt: r.loc.updatedAt.toISOString(),
        });
      }
    }
    return accessible;
  }

  async createLocation(
    eventId: string,
    data: CreateLocationRequest,
    user: AuthenticatedUser
  ): Promise<LocationResponse> {
    const locId = generateId();

    return this.db.transaction(async (tx) => {
      const identifier = await this.identifierAllocator.allocate(eventId, 'location', 'LOC', tx, 6);
      await this.resourceService.registerResource(eventId, 'location', {
        id: locId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      const [created] = await tx
        .insert(locations)
        .values({
          id: locId,
          identifier,
          name: data.name,
          description: data.description ?? null,
          addressText: data.addressText ?? null,
          locationType: data.locationType ?? null,
          city: data.city ?? null,
          region: data.region ?? null,
          country: data.country ?? null,
          postalCode: data.postalCode ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          provenance: data.provenance ?? 'MANUAL',
          generationBatchId: data.generationBatchId ?? null,
          generationSeed: data.generationSeed ?? null,
        })
        .returning();

      await this.auditService.record({
        action: 'registry.location.created',
        category: 'registry',
        eventId,
        resourceType: 'location',
        resourceId: locId,
        actorUserId: user.id,
        metadata: { name: data.name },
      });

      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: locId,
          activityType: 'registry.location.created',
          actorUserId: user.id,
          title: `Registered location '${data.name}'`,
          summary: data.description ?? undefined,
          visibility: data.visibility,
        },
        tx
      );

      await this.searchIndexerService.emitSearchUpsert('location', locId, tx);

      return {
        id: created!.id,
        identifier: created!.identifier,
        eventId,
        name: created!.name,
        description: created!.description,
        addressText: created!.addressText,
        locationType: created!.locationType,
        visibility: data.visibility || 'EVENT',
        owningUnitId: data.owningUnitId,
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      };
    });
  }

  async getLocation(eventId: string, locId: string, user: AuthenticatedUser): Promise<LocationResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, locId, Permissions.REGISTRY_READ);

    const [row] = await this.db
      .select({ loc: locations, resource: resources })
      .from(locations)
      .innerJoin(resources, eq(locations.id, resources.id))
      .where(eq(locations.id, locId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Location '${locId}' not found`);
    }

    return {
      id: row.loc.id,
      identifier: row.loc.identifier,
      eventId: row.resource.eventId,
      name: row.loc.name,
      description: row.loc.description,
      addressText: row.loc.addressText,
      locationType: row.loc.locationType,
      city: row.loc.city,
      region: row.loc.region,
      country: row.loc.country,
      postalCode: row.loc.postalCode,
      latitude: row.loc.latitude,
      longitude: row.loc.longitude,
      visibility: row.resource.visibility,
      owningUnitId: row.resource.owningUnitId,
      createdAt: row.loc.createdAt.toISOString(),
      updatedAt: row.loc.updatedAt.toISOString(),
    };
  }

  async updateLocation(
    eventId: string,
    locId: string,
    data: UpdateLocationRequest,
    user: AuthenticatedUser
  ): Promise<LocationResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, locId, Permissions.REGISTRY_UPDATE);

    const existing = await this.getLocation(eventId, locId, user);

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.addressText !== undefined) updatePayload.addressText = data.addressText;
    if (data.locationType !== undefined) updatePayload.locationType = data.locationType;
    if (data.city !== undefined) updatePayload.city = data.city;
    if (data.region !== undefined) updatePayload.region = data.region;
    if (data.country !== undefined) updatePayload.country = data.country;
    if (data.postalCode !== undefined) updatePayload.postalCode = data.postalCode;
    if (data.latitude !== undefined) updatePayload.latitude = data.latitude;
    if (data.longitude !== undefined) updatePayload.longitude = data.longitude;

    const [updated] = await this.db
      .update(locations)
      .set(updatePayload)
      .where(eq(locations.id, locId))
      .returning();

    await this.auditService.record({
      action: 'registry.location.updated',
      category: 'registry',
      eventId,
      resourceType: 'location',
      resourceId: locId,
      actorUserId: user.id,
      metadata: { name: updated!.name },
    });

    await this.searchIndexerService.emitSearchUpsert('location', locId);

    return {
      ...existing,
      ...updated!,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }

  // ============================================================================
  // Vehicles
  // ============================================================================

  async listVehicles(eventId: string, user: AuthenticatedUser): Promise<VehicleResponse[]> {
    const rows = await this.db
      .select({ veh: vehicles, resource: resources })
      .from(vehicles)
      .innerJoin(resources, eq(vehicles.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(vehicles.createdAt));

    const accessible: VehicleResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.veh.id, Permissions.REGISTRY_READ)) {
        accessible.push({
          id: r.veh.id,
          identifier: r.veh.identifier,
          eventId: r.resource.eventId,
          label: r.veh.label,
          registrationPlate: r.veh.registrationPlate,
          vin: r.veh.vin,
          make: r.veh.make,
          model: r.veh.model,
          variant: r.veh.variant,
          modelYear: r.veh.modelYear,
          colour: r.veh.colour,
          description: r.veh.description,
          status: r.veh.status,
          provenance: r.veh.provenance,
          generationBatchId: r.veh.generationBatchId,
          generationSeed: r.veh.generationSeed,
          visibility: r.resource.visibility,
          owningUnitId: r.resource.owningUnitId,
          createdAt: r.veh.createdAt.toISOString(),
          updatedAt: r.veh.updatedAt.toISOString(),
        });
      }
    }
    return accessible;
  }

  async createVehicle(
    eventId: string,
    data: CreateVehicleRequest,
    user: AuthenticatedUser
  ): Promise<VehicleResponse> {
    const vehicleId = generateId();

    return this.db.transaction(async (tx) => {
      const identifier = await this.identifierAllocator.allocate(eventId, 'vehicle', 'VEH', tx, 6);
      await this.resourceService.registerResource(eventId, 'vehicle', {
        id: vehicleId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      const [created] = await tx
        .insert(vehicles)
        .values({
          id: vehicleId,
          identifier,
          label: data.label,
          registrationPlate: data.registrationPlate ?? null,
          vin: data.vin ?? null,
          make: data.make ?? null,
          model: data.model ?? null,
          variant: data.variant ?? null,
          modelYear: data.modelYear ?? null,
          colour: data.colour ?? null,
          description: data.description ?? null,
          status: data.status,
          provenance: data.provenance ?? 'MANUAL',
          generationBatchId: data.generationBatchId ?? null,
          generationSeed: data.generationSeed ?? null,
        })
        .returning();

      await this.auditService.record({
        action: 'registry.vehicle.created',
        category: 'registry',
        eventId,
        resourceType: 'vehicle',
        resourceId: vehicleId,
        actorUserId: user.id,
        metadata: { label: data.label, registrationPlate: data.registrationPlate },
      });

      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: vehicleId,
          activityType: 'registry.vehicle.created',
          actorUserId: user.id,
          title: `Registered vehicle '${data.label}'`,
          summary: data.registrationPlate ? `Plate: ${data.registrationPlate}` : undefined,
          visibility: data.visibility,
        },
        tx
      );

      await this.searchIndexerService.emitSearchUpsert('vehicle', vehicleId, tx);

      return {
        id: created!.id,
        identifier: created!.identifier,
        eventId,
        label: created!.label,
        registrationPlate: created!.registrationPlate,
        vin: created!.vin,
        make: created!.make,
        model: created!.model,
        colour: created!.colour,
        description: created!.description,
        status: created!.status,
        visibility: data.visibility || 'EVENT',
        owningUnitId: data.owningUnitId,
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      };
    });
  }

  async getVehicle(eventId: string, vehicleId: string, user: AuthenticatedUser): Promise<VehicleResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, vehicleId, Permissions.REGISTRY_READ);

    const [row] = await this.db
      .select({ veh: vehicles, resource: resources })
      .from(vehicles)
      .innerJoin(resources, eq(vehicles.id, resources.id))
      .where(eq(vehicles.id, vehicleId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Vehicle '${vehicleId}' not found`);
    }

    return {
      id: row.veh.id,
      identifier: row.veh.identifier,
      eventId: row.resource.eventId,
      label: row.veh.label,
      registrationPlate: row.veh.registrationPlate,
      vin: row.veh.vin,
      make: row.veh.make,
      model: row.veh.model,
      variant: row.veh.variant,
      modelYear: row.veh.modelYear,
      colour: row.veh.colour,
      description: row.veh.description,
      status: row.veh.status,
      visibility: row.resource.visibility,
      owningUnitId: row.resource.owningUnitId,
      createdAt: row.veh.createdAt.toISOString(),
      updatedAt: row.veh.updatedAt.toISOString(),
    };
  }

  async updateVehicle(
    eventId: string,
    vehicleId: string,
    data: UpdateVehicleRequest,
    user: AuthenticatedUser
  ): Promise<VehicleResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, vehicleId, Permissions.REGISTRY_UPDATE);

    const existing = await this.getVehicle(eventId, vehicleId, user);

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (data.label !== undefined) updatePayload.label = data.label;
    if (data.registrationPlate !== undefined) updatePayload.registrationPlate = data.registrationPlate;
    if (data.vin !== undefined) updatePayload.vin = data.vin;
    if (data.make !== undefined) updatePayload.make = data.make;
    if (data.model !== undefined) updatePayload.model = data.model;
    if (data.variant !== undefined) updatePayload.variant = data.variant;
    if (data.modelYear !== undefined) updatePayload.modelYear = data.modelYear;
    if (data.colour !== undefined) updatePayload.colour = data.colour;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.status !== undefined) updatePayload.status = data.status;

    const [updated] = await this.db
      .update(vehicles)
      .set(updatePayload)
      .where(eq(vehicles.id, vehicleId))
      .returning();

    await this.auditService.record({
      action: 'registry.vehicle.updated',
      category: 'registry',
      eventId,
      resourceType: 'vehicle',
      resourceId: vehicleId,
      actorUserId: user.id,
      metadata: { label: updated!.label },
    });

    await this.searchIndexerService.emitSearchUpsert('vehicle', vehicleId);

    return {
      ...existing,
      ...updated!,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }

  // ============================================================================
  // Devices
  // ============================================================================

  async listDevices(eventId: string, user: AuthenticatedUser): Promise<DeviceResponse[]> {
    const rows = await this.db
      .select({ dev: devices, resource: resources })
      .from(devices)
      .innerJoin(resources, eq(devices.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(devices.createdAt));

    const accessible: DeviceResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.dev.id, Permissions.REGISTRY_READ)) {
        accessible.push({
          id: r.dev.id,
          identifier: r.dev.identifier,
          eventId: r.resource.eventId,
          label: r.dev.label,
          deviceType: r.dev.deviceType,
          manufacturer: r.dev.manufacturer,
          model: r.dev.model,
          serialNumber: r.dev.serialNumber,
          hostname: r.dev.hostname,
          assetTag: r.dev.assetTag,
          operatingSystem: r.dev.operatingSystem,
          macAddress: r.dev.macAddress,
          ipAddress: r.dev.ipAddress,
          description: r.dev.description,
          status: r.dev.status,
          provenance: r.dev.provenance,
          generationBatchId: r.dev.generationBatchId,
          generationSeed: r.dev.generationSeed,
          visibility: r.resource.visibility,
          owningUnitId: r.resource.owningUnitId,
          createdAt: r.dev.createdAt.toISOString(),
          updatedAt: r.dev.updatedAt.toISOString(),
        });
      }
    }
    return accessible;
  }

  async createDevice(
    eventId: string,
    data: CreateDeviceRequest,
    user: AuthenticatedUser
  ): Promise<DeviceResponse> {
    const deviceId = generateId();

    return this.db.transaction(async (tx) => {
      const identifier = await this.identifierAllocator.allocate(eventId, 'device', 'DEV', tx, 6);
      await this.resourceService.registerResource(eventId, 'device', {
        id: deviceId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      const [created] = await tx
        .insert(devices)
        .values({
          id: deviceId,
          identifier,
          label: data.label,
          deviceType: data.deviceType,
          manufacturer: data.manufacturer ?? null,
          model: data.model ?? null,
          serialNumber: data.serialNumber ?? null,
          assetTag: data.assetTag ?? null,
          hostname: data.hostname ?? null,
          operatingSystem: data.operatingSystem ?? null,
          macAddress: data.macAddress ?? null,
          ipAddress: data.ipAddress ?? null,
          description: data.description ?? null,
          status: data.status,
          provenance: data.provenance ?? 'MANUAL',
          generationBatchId: data.generationBatchId ?? null,
          generationSeed: data.generationSeed ?? null,
        })
        .returning();

      await this.auditService.record({
        action: 'registry.device.created',
        category: 'registry',
        eventId,
        resourceType: 'device',
        resourceId: deviceId,
        actorUserId: user.id,
        metadata: { label: data.label, deviceType: data.deviceType },
      });

      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: deviceId,
          activityType: 'registry.device.created',
          actorUserId: user.id,
          title: `Registered ${data.deviceType} '${data.label}'`,
          summary: data.hostname ? `Hostname: ${data.hostname}` : undefined,
          visibility: data.visibility,
        },
        tx
      );

      await this.searchIndexerService.emitSearchUpsert('device', deviceId, tx);

      return {
        id: created!.id,
        identifier: created!.identifier,
        eventId,
        label: created!.label,
        deviceType: created!.deviceType,
        manufacturer: created!.manufacturer,
        model: created!.model,
        serialNumber: created!.serialNumber,
        hostname: created!.hostname,
        description: created!.description,
        status: created!.status,
        visibility: data.visibility || 'EVENT',
        owningUnitId: data.owningUnitId,
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      };
    });
  }

  async getDevice(eventId: string, deviceId: string, user: AuthenticatedUser): Promise<DeviceResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, deviceId, Permissions.REGISTRY_READ);

    const [row] = await this.db
      .select({ dev: devices, resource: resources })
      .from(devices)
      .innerJoin(resources, eq(devices.id, resources.id))
      .where(eq(devices.id, deviceId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Device '${deviceId}' not found`);
    }

    return {
      id: row.dev.id,
      identifier: row.dev.identifier,
      eventId: row.resource.eventId,
      label: row.dev.label,
      deviceType: row.dev.deviceType,
      manufacturer: row.dev.manufacturer,
      model: row.dev.model,
      serialNumber: row.dev.serialNumber,
      hostname: row.dev.hostname,
      assetTag: row.dev.assetTag,
      operatingSystem: row.dev.operatingSystem,
      macAddress: row.dev.macAddress,
      ipAddress: row.dev.ipAddress,
      description: row.dev.description,
      status: row.dev.status,
      visibility: row.resource.visibility,
      owningUnitId: row.resource.owningUnitId,
      createdAt: row.dev.createdAt.toISOString(),
      updatedAt: row.dev.updatedAt.toISOString(),
    };
  }

  async updateDevice(
    eventId: string,
    deviceId: string,
    data: UpdateDeviceRequest,
    user: AuthenticatedUser
  ): Promise<DeviceResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, deviceId, Permissions.REGISTRY_UPDATE);

    const existing = await this.getDevice(eventId, deviceId, user);

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (data.label !== undefined) updatePayload.label = data.label;
    if (data.deviceType !== undefined) updatePayload.deviceType = data.deviceType;
    if (data.manufacturer !== undefined) updatePayload.manufacturer = data.manufacturer;
    if (data.model !== undefined) updatePayload.model = data.model;
    if (data.serialNumber !== undefined) updatePayload.serialNumber = data.serialNumber;
    if (data.hostname !== undefined) updatePayload.hostname = data.hostname;
    if (data.assetTag !== undefined) updatePayload.assetTag = data.assetTag;
    if (data.operatingSystem !== undefined) updatePayload.operatingSystem = data.operatingSystem;
    if (data.macAddress !== undefined) updatePayload.macAddress = data.macAddress;
    if (data.ipAddress !== undefined) updatePayload.ipAddress = data.ipAddress;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.status !== undefined) updatePayload.status = data.status;

    const [updated] = await this.db
      .update(devices)
      .set(updatePayload)
      .where(eq(devices.id, deviceId))
      .returning();

    await this.auditService.record({
      action: 'registry.device.updated',
      category: 'registry',
      eventId,
      resourceType: 'device',
      resourceId: deviceId,
      actorUserId: user.id,
      metadata: { label: updated!.label },
    });

    await this.searchIndexerService.emitSearchUpsert('device', deviceId);

    return {
      ...existing,
      ...updated!,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }

  async listWeapons(eventId: string, user: AuthenticatedUser): Promise<WeaponResponse[]> {
    const rows = await this.db.select({ weapon: weapons, resource: resources })
      .from(weapons).innerJoin(resources, eq(weapons.id, resources.id))
      .where(eq(resources.eventId, eventId)).orderBy(desc(weapons.createdAt));
    const accessible: WeaponResponse[] = [];
    for (const row of rows) {
      if (await this.resourceAccessService.canAccessResource(user, row.weapon.id, Permissions.REGISTRY_READ)) {
        accessible.push(this.toWeaponResponse(row.weapon, row.resource));
      }
    }
    return accessible;
  }

  async createWeapon(eventId: string, data: CreateWeaponRequest, user: AuthenticatedUser): Promise<WeaponResponse> {
    const weaponId = generateId();
    return this.db.transaction(async (tx) => {
      const identifier = await this.identifierAllocator.allocate(eventId, 'weapon', 'WPN', tx, 6);
      await this.resourceService.registerResource(eventId, 'weapon', {
        id: weaponId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });
      const [created] = await tx.insert(weapons).values({
        id: weaponId,
        identifier,
        category: data.category,
        manufacturer: data.manufacturer ?? null,
        model: data.model ?? null,
        serialNumber: data.serialNumber ?? null,
        calibre: data.calibre ?? null,
        description: data.description ?? null,
        status: data.status,
        provenance: data.provenance,
        generationBatchId: data.generationBatchId ?? null,
        generationSeed: data.generationSeed ?? null,
      }).returning();
      await this.auditService.record({
        action: 'registry.weapon.created',
        category: 'registry',
        eventId,
        resourceType: 'weapon',
        resourceId: weaponId,
        actorUserId: user.id,
        metadata: { category: data.category },
      });
      await this.activityService.recordActivity({
        eventId,
        resourceId: weaponId,
        activityType: 'registry.weapon.created',
        actorUserId: user.id,
        title: `Registered weapon '${data.category}'`,
        summary: data.description,
        visibility: data.visibility,
      }, tx);
      await this.searchIndexerService.emitSearchUpsert('weapon', weaponId, tx);
      return this.toWeaponResponse(created!, { eventId, visibility: data.visibility, owningUnitId: data.owningUnitId ?? null } as any);
    });
  }

  async getWeapon(eventId: string, weaponId: string, user: AuthenticatedUser): Promise<WeaponResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, weaponId, Permissions.REGISTRY_READ);
    const [row] = await this.db.select({ weapon: weapons, resource: resources })
      .from(weapons).innerJoin(resources, eq(weapons.id, resources.id))
      .where(eq(weapons.id, weaponId)).limit(1);
    if (!row || row.resource.eventId !== eventId) throw new NotFoundException(`Weapon '${weaponId}' not found`);
    return this.toWeaponResponse(row.weapon, row.resource);
  }

  async updateWeapon(eventId: string, weaponId: string, data: UpdateWeaponRequest, user: AuthenticatedUser): Promise<WeaponResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, weaponId, Permissions.REGISTRY_UPDATE);
    const existing = await this.getWeapon(eventId, weaponId, user);
    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of ['category', 'manufacturer', 'model', 'serialNumber', 'calibre', 'description', 'status', 'provenance', 'generationBatchId', 'generationSeed'] as const) {
      if (data[field] !== undefined) updatePayload[field] = data[field];
    }
    const [updated] = await this.db.update(weapons).set(updatePayload).where(eq(weapons.id, weaponId)).returning();
    await this.auditService.record({
      action: 'registry.weapon.updated',
      category: 'registry',
      eventId,
      resourceType: 'weapon',
      resourceId: weaponId,
      actorUserId: user.id,
      metadata: { category: updated!.category },
    });
    await this.searchIndexerService.emitSearchUpsert('weapon', weaponId);
    return { ...existing, ...this.toWeaponResponse(updated!, { eventId, visibility: existing.visibility, owningUnitId: existing.owningUnitId } as any) };
  }

  private toWeaponResponse(weapon: typeof weapons.$inferSelect, resource: { eventId: string; visibility: string; owningUnitId?: string | null }): WeaponResponse {
    return {
      id: weapon.id,
      identifier: weapon.identifier,
      eventId: resource.eventId,
      category: weapon.category,
      manufacturer: weapon.manufacturer,
      model: weapon.model,
      serialNumber: weapon.serialNumber,
      calibre: weapon.calibre,
      description: weapon.description,
      status: weapon.status,
      provenance: weapon.provenance,
      generationBatchId: weapon.generationBatchId,
      generationSeed: weapon.generationSeed,
      visibility: resource.visibility,
      owningUnitId: resource.owningUnitId ?? null,
      createdAt: weapon.createdAt.toISOString(),
      updatedAt: weapon.updatedAt.toISOString(),
    };
  }
}
