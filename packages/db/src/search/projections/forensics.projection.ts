import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { forensicAnalyses, resources } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class ForensicAnalysisSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['forensic_analysis'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ analysis: forensicAnalyses, resource: resources })
      .from(forensicAnalyses)
      .innerJoin(resources, eq(forensicAnalyses.id, resources.id))
      .where(eq(forensicAnalyses.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const assignedUserIds = row.analysis.assignedToUserId ? [row.analysis.assignedToUserId] : [];
    const content = [
      row.analysis.purpose,
      row.analysis.methodology,
      row.analysis.findings,
      row.analysis.conclusion,
    ]
      .filter(Boolean)
      .join(' ');

    const searchable = `${row.analysis.analysisNumber} ${row.analysis.analysisType} ${row.analysis.status} ${content}`;

    return {
      id: `forensic_analysis:${row.analysis.id}`,
      canonicalId: row.analysis.id,
      resourceType: 'forensic_analysis',
      eventId: row.resource.eventId,
      title: `${row.analysis.analysisNumber}: ${row.analysis.analysisType}`,
      subtitle: `Forensic Analysis · ${row.analysis.status}`,
      content,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.analysis.id, row.analysis.analysisNumber],
      tags: ['forensics', 'digital', row.analysis.analysisType.toLowerCase(), row.analysis.status.toLowerCase()],
      status: row.analysis.status,
      requiredPermission: Permissions.FORENSICS_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.analysis.assignedUnitId
        ? [row.analysis.assignedUnitId]
        : row.analysis.requestedFromUnitId
        ? [row.analysis.requestedFromUnitId]
        : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds,
      route: `/events/${row.resource.eventId}/forensics/${row.analysis.id}`,
      createdAt: row.analysis.createdAt ? row.analysis.createdAt.getTime() : 0,
      updatedAt: row.analysis.updatedAt ? row.analysis.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ analysis: forensicAnalyses, resource: resources })
      .from(forensicAnalyses)
      .innerJoin(resources, eq(forensicAnalyses.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'forensic_analysis', r.analysis.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
