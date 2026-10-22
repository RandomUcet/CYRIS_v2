import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { evidence, resources } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class EvidenceSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['evidence'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ ev: evidence, resource: resources })
      .from(evidence)
      .innerJoin(resources, eq(evidence.id, resources.id))
      .where(eq(evidence.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const desc = row.ev.description || '';
    const searchable = `${row.ev.evidenceNumber} ${row.ev.title} ${row.ev.evidenceType} ${row.ev.status} ${row.ev.condition || ''} ${desc}`;

    return {
      id: `evidence:${row.ev.id}`,
      canonicalId: row.ev.id,
      resourceType: 'evidence',
      eventId: row.resource.eventId,
      title: `${row.ev.evidenceNumber}: ${row.ev.title}`,
      subtitle: `Evidence · ${row.ev.evidenceType} · Status: ${row.ev.status} (Holder: ${row.ev.currentHolderType})`,
      content: `${desc}${row.ev.condition ? ` Condition: ${row.ev.condition}` : ''}`,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.ev.id, row.ev.evidenceNumber],
      tags: ['evidence', row.ev.status.toLowerCase(), row.ev.evidenceType.toLowerCase()],
      status: row.ev.status,
      requiredPermission: Permissions.EVIDENCE_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.ev.owningUnitId ? [row.ev.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/evidence/${row.ev.id}`,
      createdAt: row.ev.createdAt ? row.ev.createdAt.getTime() : 0,
      updatedAt: row.ev.updatedAt ? row.ev.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ ev: evidence, resource: resources })
      .from(evidence)
      .innerJoin(resources, eq(evidence.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'evidence', r.ev.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
