import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { medicalEncounters, resources } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

/**
 * Medical Encounter Search Projection Provider
 * STRICT CONFIDENTIALITY: Projects ONLY operational metadata (number, triage, status, chief complaint).
 * Excludes all sensitive clinical measurements, vital signs, or intervention details.
 */
export class MedicalSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['medical_encounter', 'medical'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ encounter: medicalEncounters, resource: resources })
      .from(medicalEncounters)
      .innerJoin(resources, eq(medicalEncounters.id, resources.id))
      .where(eq(medicalEncounters.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const content = row.encounter.chiefComplaint || '';
    const searchable = `${row.encounter.medicalNumber} ${row.encounter.triageCategory} ${row.encounter.status} ${content}`;

    return {
      id: `medical_encounter:${row.encounter.id}`,
      canonicalId: row.encounter.id,
      resourceType: 'medical_encounter',
      eventId: row.resource.eventId,
      title: `${row.encounter.medicalNumber}: Casualty (${row.encounter.triageCategory})`,
      subtitle: `Medical · ${row.encounter.status} · ${row.encounter.triageCategory}`,
      content,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.encounter.id, row.encounter.medicalNumber],
      tags: ['medical', 'casualty', row.encounter.triageCategory.toLowerCase(), row.encounter.status.toLowerCase()],
      status: row.encounter.status,
      requiredPermission: Permissions.MEDICAL_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: [row.encounter.assignedUnitId, row.resource.owningUnitId].filter(
        (u): u is string => Boolean(u)
      ),
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: row.encounter.assignedUserId ? [row.encounter.assignedUserId] : [],
      route: `/events/${row.resource.eventId}/medical/${row.encounter.id}`,
      createdAt: row.encounter.createdAt ? row.encounter.createdAt.getTime() : 0,
      updatedAt: row.encounter.updatedAt ? row.encounter.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ encounter: medicalEncounters, resource: resources })
      .from(medicalEncounters)
      .innerJoin(resources, eq(medicalEncounters.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'medical_encounter', r.encounter.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
