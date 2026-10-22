import { eq, and } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import {
  persons,
  organisations,
  locations,
  vehicles,
  devices,
  weapons,
  resources,
} from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class PersonSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['person'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ person: persons, resource: resources })
      .from(persons)
      .innerJoin(resources, eq(persons.id, resources.id))
      .where(eq(persons.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null; // Fail-closed: do not globally index restricted/scenario records
    }

    const aliases = (row.person.aliases as string[]) || [];
    const nameDetails = [row.person.givenName, row.person.familyName].filter(Boolean).join(' ');
    const desc = row.person.description || '';
    const contacts = [
      ...((row.person.emails as Array<{ value: string }>) || []),
      ...((row.person.phones as Array<{ value: string }>) || []),
    ].map((contact) => contact.value);
    const searchable = `${row.person.displayName} ${nameDetails} ${aliases.join(' ')} ${contacts.join(' ')} ${row.person.nationality || ''} ${desc}`;

    return {
      id: `person:${row.person.id}`,
      canonicalId: row.person.id,
      resourceType: 'person',
      eventId: row.resource.eventId,
      title: row.person.displayName,
      subtitle: `Person · ${row.person.status}${row.person.nationality ? ` · ${row.person.nationality}` : ''}`,
      content: `${nameDetails ? `(${nameDetails}) ` : ''}${desc}`,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.person.id, row.person.identifier, ...aliases, ...contacts].filter(
        (value): value is string => Boolean(value)
      ),
      tags: ['person', 'registry', row.person.status.toLowerCase()],
      status: row.person.status,
      requiredPermission: Permissions.REGISTRY_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/registry/persons/${row.person.id}`,
      createdAt: row.person.createdAt ? row.person.createdAt.getTime() : 0,
      updatedAt: row.person.updatedAt ? row.person.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ person: persons, resource: resources })
      .from(persons)
      .innerJoin(resources, eq(persons.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'person', r.person.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}

export class WeaponSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] { return ['weapon']; }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db.select({ weapon: weapons, resource: resources })
      .from(weapons).innerJoin(resources, eq(weapons.id, resources.id))
      .where(eq(weapons.id, id)).limit(1);
    if (!row || ['RESTRICTED', 'SCENARIO'].includes(row.resource.visibility)) return null;
    const identifiers = [row.weapon.id, row.weapon.identifier, row.weapon.serialNumber].filter(
      (value): value is string => Boolean(value)
    );
    const searchable = `${row.weapon.category} ${row.weapon.identifier || ''} ${row.weapon.manufacturer || ''} ${row.weapon.model || ''} ${row.weapon.serialNumber || ''} ${row.weapon.calibre || ''} ${row.weapon.description || ''}`;
    return {
      id: `weapon:${row.weapon.id}`,
      canonicalId: row.weapon.id,
      resourceType: 'weapon',
      eventId: row.resource.eventId,
      title: row.weapon.category,
      subtitle: `Weapon · ${row.weapon.manufacturer || ''} ${row.weapon.model || ''}`,
      content: row.weapon.description || '',
      normalizedContent: normalizeSearchText(searchable),
      identifiers,
      tags: ['weapon', 'registry', row.weapon.status.toLowerCase()],
      status: row.weapon.status,
      requiredPermission: Permissions.REGISTRY_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/registry/weapons/${row.weapon.id}`,
      createdAt: row.weapon.createdAt.getTime(),
      updatedAt: row.weapon.updatedAt.getTime(),
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db.select({ weapon: weapons, resource: resources })
      .from(weapons).innerJoin(resources, eq(weapons.id, resources.id));
    const rows = eventId ? await query.where(eq(resources.eventId, eventId)) : await query;
    const docs: SearchDocument[] = [];
    for (const row of rows) {
      const doc = await this.buildDocument(db, 'weapon', row.weapon.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}

export class OrganisationSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['organisation'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ org: organisations, resource: resources })
      .from(organisations)
      .innerJoin(resources, eq(organisations.id, resources.id))
      .where(eq(organisations.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const desc = row.org.description || '';
    const searchable = `${row.org.name} ${row.org.shortName || ''} ${(row.org.aliases as string[] || []).join(' ')} ${row.org.legalName || ''} ${row.org.registrationNumber || ''} ${row.org.email || ''} ${row.org.phone || ''} ${desc}`;
    const identifiers = [row.org.id, row.org.identifier, ...((row.org.aliases as string[]) || [])].filter(
      (value): value is string => Boolean(value)
    );
    if (row.org.registrationNumber) identifiers.push(row.org.registrationNumber);

    return {
      id: `organisation:${row.org.id}`,
      canonicalId: row.org.id,
      resourceType: 'organisation',
      eventId: row.resource.eventId,
      title: row.org.name,
      subtitle: `Organisation · ${row.org.status}${row.org.legalName ? ` · ${row.org.legalName}` : ''}`,
      content: desc,
      normalizedContent: normalizeSearchText(searchable),
      identifiers,
      tags: ['organisation', 'registry', row.org.status.toLowerCase()],
      status: row.org.status,
      requiredPermission: Permissions.REGISTRY_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/registry/organisations/${row.org.id}`,
      createdAt: row.org.createdAt ? row.org.createdAt.getTime() : 0,
      updatedAt: row.org.updatedAt ? row.org.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ org: organisations, resource: resources })
      .from(organisations)
      .innerJoin(resources, eq(organisations.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'organisation', r.org.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}

export class LocationSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['location'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ loc: locations, resource: resources })
      .from(locations)
      .innerJoin(resources, eq(locations.id, resources.id))
      .where(eq(locations.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const desc = row.loc.description || '';
    const searchable = `${row.loc.name} ${row.loc.identifier || ''} ${row.loc.addressText || ''} ${row.loc.city || ''} ${row.loc.region || ''} ${row.loc.postalCode || ''} ${row.loc.locationType || ''} ${desc}`;

    return {
      id: `location:${row.loc.id}`,
      canonicalId: row.loc.id,
      resourceType: 'location',
      eventId: row.resource.eventId,
      title: row.loc.name,
      subtitle: `Location · ${row.loc.locationType || 'General'}${row.loc.addressText ? ` · ${row.loc.addressText}` : ''}`,
      content: desc,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.loc.id, row.loc.identifier].filter(
        (value): value is string => Boolean(value)
      ),
      tags: ['location', 'registry', (row.loc.locationType || 'general').toLowerCase()],
      status: 'ACTIVE',
      requiredPermission: Permissions.REGISTRY_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/registry/locations/${row.loc.id}`,
      createdAt: row.loc.createdAt ? row.loc.createdAt.getTime() : 0,
      updatedAt: row.loc.updatedAt ? row.loc.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ loc: locations, resource: resources })
      .from(locations)
      .innerJoin(resources, eq(locations.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'location', r.loc.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}

export class VehicleSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['vehicle'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ vehicle: vehicles, resource: resources })
      .from(vehicles)
      .innerJoin(resources, eq(vehicles.id, resources.id))
      .where(eq(vehicles.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const identifiers = [row.vehicle.id, row.vehicle.identifier].filter(
      (value): value is string => Boolean(value)
    );
    if (row.vehicle.registrationPlate) identifiers.push(row.vehicle.registrationPlate);
    if (row.vehicle.vin) identifiers.push(row.vehicle.vin);

    const desc = row.vehicle.description || '';
    const searchable = `${row.vehicle.label} ${row.vehicle.identifier || ''} ${row.vehicle.registrationPlate || ''} ${row.vehicle.vin || ''} ${row.vehicle.make || ''} ${row.vehicle.model || ''} ${row.vehicle.variant || ''} ${row.vehicle.colour || ''} ${desc}`;

    return {
      id: `vehicle:${row.vehicle.id}`,
      canonicalId: row.vehicle.id,
      resourceType: 'vehicle',
      eventId: row.resource.eventId,
      title: row.vehicle.label,
      subtitle: `Vehicle · ${row.vehicle.registrationPlate || 'No Plate'} · ${row.vehicle.make || ''} ${row.vehicle.model || ''} (${row.vehicle.colour || ''})`,
      content: desc,
      normalizedContent: normalizeSearchText(searchable),
      identifiers,
      tags: ['vehicle', 'registry', row.vehicle.status.toLowerCase()],
      status: row.vehicle.status,
      requiredPermission: Permissions.REGISTRY_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/registry/vehicles/${row.vehicle.id}`,
      createdAt: row.vehicle.createdAt ? row.vehicle.createdAt.getTime() : 0,
      updatedAt: row.vehicle.updatedAt ? row.vehicle.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ vehicle: vehicles, resource: resources })
      .from(vehicles)
      .innerJoin(resources, eq(vehicles.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'vehicle', r.vehicle.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}

export class DeviceSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['device'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ device: devices, resource: resources })
      .from(devices)
      .innerJoin(resources, eq(devices.id, resources.id))
      .where(eq(devices.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const identifiers = [row.device.id, row.device.identifier, row.device.assetTag].filter(
      (value): value is string => Boolean(value)
    );
    if (row.device.serialNumber) identifiers.push(row.device.serialNumber);
    if (row.device.hostname) identifiers.push(row.device.hostname);

    const desc = row.device.description || '';
    const searchable = `${row.device.label} ${row.device.identifier || ''} ${row.device.assetTag || ''} ${row.device.deviceType} ${row.device.manufacturer || ''} ${row.device.model || ''} ${row.device.serialNumber || ''} ${row.device.hostname || ''} ${row.device.operatingSystem || ''} ${row.device.macAddress || ''} ${row.device.ipAddress || ''} ${desc}`;

    return {
      id: `device:${row.device.id}`,
      canonicalId: row.device.id,
      resourceType: 'device',
      eventId: row.resource.eventId,
      title: row.device.label,
      subtitle: `Device · ${row.device.deviceType} · ${row.device.manufacturer || ''} ${row.device.model || ''}`,
      content: desc,
      normalizedContent: normalizeSearchText(searchable),
      identifiers,
      tags: ['device', 'registry', row.device.deviceType.toLowerCase(), row.device.status.toLowerCase()],
      status: row.device.status,
      requiredPermission: Permissions.REGISTRY_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/registry/devices/${row.device.id}`,
      createdAt: row.device.createdAt ? row.device.createdAt.getTime() : 0,
      updatedAt: row.device.updatedAt ? row.device.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ device: devices, resource: resources })
      .from(devices)
      .innerJoin(resources, eq(devices.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'device', r.device.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
