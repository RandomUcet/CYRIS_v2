import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { documents, resources } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class DocumentSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['document'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ doc: documents, resource: resources })
      .from(documents)
      .innerJoin(resources, eq(documents.id, resources.id))
      .where(eq(documents.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const content = [row.doc.description, row.doc.extractedText].filter(Boolean).join(' ');
    const searchable = `${row.doc.documentNumber || ''} ${row.doc.title} ${row.doc.originalFilename} ${row.doc.documentType} ${content}`;
    const identifiers = [row.doc.id];
    if (row.doc.documentNumber) {
      identifiers.push(row.doc.documentNumber);
    }

    return {
      id: `document:${row.doc.id}`,
      canonicalId: row.doc.id,
      resourceType: 'document',
      eventId: row.resource.eventId,
      title: row.doc.documentNumber ? `${row.doc.documentNumber}: ${row.doc.title}` : row.doc.title,
      subtitle: `${row.doc.documentType} · ${row.doc.originalFilename}`,
      content,
      normalizedContent: normalizeSearchText(searchable),
      identifiers,
      tags: ['document', row.doc.documentType.toLowerCase(), row.doc.status.toLowerCase()],
      status: row.doc.status,
      requiredPermission: Permissions.DOCUMENT_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/documents/${row.doc.id}`,
      createdAt: row.doc.createdAt ? row.doc.createdAt.getTime() : 0,
      updatedAt: row.doc.updatedAt ? row.doc.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ doc: documents, resource: resources })
      .from(documents)
      .innerJoin(resources, eq(documents.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'document', r.doc.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
