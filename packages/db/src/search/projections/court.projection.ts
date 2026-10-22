import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { courtCases, resources } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class CourtCaseSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['court_case'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ court: courtCases, resource: resources })
      .from(courtCases)
      .innerJoin(resources, eq(courtCases.id, resources.id))
      .where(eq(courtCases.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const content = row.court.summary || '';
    const searchable = `${row.court.courtCaseNumber} ${row.court.title} ${row.court.status} ${content}`;

    return {
      id: `court_case:${row.court.id}`,
      canonicalId: row.court.id,
      resourceType: 'court_case',
      eventId: row.resource.eventId,
      title: `${row.court.courtCaseNumber}: ${row.court.title}`,
      subtitle: `Court Case · ${row.court.status}`,
      content,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.court.id, row.court.courtCaseNumber],
      tags: ['court', 'legal', row.court.status.toLowerCase()],
      status: row.court.status,
      requiredPermission: Permissions.COURT_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/court/${row.court.id}`,
      createdAt: row.court.createdAt ? row.court.createdAt.getTime() : 0,
      updatedAt: row.court.updatedAt ? row.court.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ court: courtCases, resource: resources })
      .from(courtCases)
      .innerJoin(resources, eq(courtCases.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'court_case', r.court.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
