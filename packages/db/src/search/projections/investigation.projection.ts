import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import {
  incidents,
  cases,
  resources,
  resourceAssignments,
} from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class IncidentSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['incident'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ incident: incidents, resource: resources })
      .from(incidents)
      .innerJoin(resources, eq(incidents.id, resources.id))
      .where(eq(incidents.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const assignments = await db
      .select({ userId: resourceAssignments.userId })
      .from(resourceAssignments)
      .where(eq(resourceAssignments.resourceId, id));

    const assignedUserIds = assignments
      .map((a) => a.userId)
      .filter((u): u is string => Boolean(u));

    if (row.incident.leadUserId && !assignedUserIds.includes(row.incident.leadUserId)) {
      assignedUserIds.push(row.incident.leadUserId);
    }

    const desc = row.incident.description || '';
    const searchable = `${row.incident.incidentNumber} ${row.incident.title} ${desc} ${row.incident.priority} ${row.incident.status}`;

    return {
      id: `incident:${row.incident.id}`,
      canonicalId: row.incident.id,
      resourceType: 'incident',
      eventId: row.resource.eventId,
      title: `${row.incident.incidentNumber}: ${row.incident.title}`,
      subtitle: `Incident · ${row.incident.status} · Priority: ${row.incident.priority}`,
      content: desc,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.incident.id, row.incident.incidentNumber],
      tags: ['incident', row.incident.status.toLowerCase(), row.incident.priority.toLowerCase()],
      status: row.incident.status,
      requiredPermission: Permissions.INCIDENT_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.incident.owningUnitId ? [row.incident.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds,
      route: `/events/${row.resource.eventId}/incidents/${row.incident.id}`,
      createdAt: row.incident.createdAt ? row.incident.createdAt.getTime() : 0,
      updatedAt: row.incident.updatedAt ? row.incident.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ incident: incidents, resource: resources })
      .from(incidents)
      .innerJoin(resources, eq(incidents.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'incident', r.incident.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}

export class CaseSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['case'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ caseRow: cases, resource: resources })
      .from(cases)
      .innerJoin(resources, eq(cases.id, resources.id))
      .where(eq(cases.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const assignments = await db
      .select({ userId: resourceAssignments.userId })
      .from(resourceAssignments)
      .where(eq(resourceAssignments.resourceId, id));

    const assignedUserIds = assignments
      .map((a) => a.userId)
      .filter((u): u is string => Boolean(u));

    if (row.caseRow.leadUserId && !assignedUserIds.includes(row.caseRow.leadUserId)) {
      assignedUserIds.push(row.caseRow.leadUserId);
    }

    const summary = row.caseRow.summary || '';
    const searchable = `${row.caseRow.caseNumber} ${row.caseRow.title} ${summary} ${row.caseRow.priority} ${row.caseRow.status}`;

    return {
      id: `case:${row.caseRow.id}`,
      canonicalId: row.caseRow.id,
      resourceType: 'case',
      eventId: row.resource.eventId,
      title: `${row.caseRow.caseNumber}: ${row.caseRow.title}`,
      subtitle: `Case · ${row.caseRow.status} · Priority: ${row.caseRow.priority}`,
      content: summary,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.caseRow.id, row.caseRow.caseNumber],
      tags: ['case', row.caseRow.status.toLowerCase(), row.caseRow.priority.toLowerCase()],
      status: row.caseRow.status,
      requiredPermission: Permissions.CASE_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.caseRow.owningUnitId ? [row.caseRow.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds,
      route: `/events/${row.resource.eventId}/cases/${row.caseRow.id}`,
      createdAt: row.caseRow.createdAt ? row.caseRow.createdAt.getTime() : 0,
      updatedAt: row.caseRow.updatedAt ? row.caseRow.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ caseRow: cases, resource: resources })
      .from(cases)
      .innerJoin(resources, eq(cases.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'case', r.caseRow.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
