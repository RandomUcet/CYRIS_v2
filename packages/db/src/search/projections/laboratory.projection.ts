import { eq,and,ne } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { labAnalyses, labAnalysisEvidence, resources } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class LabAnalysisSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['lab_analysis'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ lab: labAnalyses, resource: resources })
      .from(labAnalyses)
      .innerJoin(resources, eq(labAnalyses.id, resources.id))
      .where(eq(labAnalyses.id, id))
      .limit(1);

    if (!row) return null;
    if(row.resource.visibility!=='EVENT')return null;
    const [privateInput]=await db.select({id:resources.id}).from(labAnalysisEvidence).innerJoin(resources,eq(resources.id,labAnalysisEvidence.evidenceId)).where(and(eq(labAnalysisEvidence.analysisId,id),ne(resources.visibility,'EVENT'))).limit(1);
    if(privateInput)return null;

    const assignedUserIds = row.lab.assignedToUserId ? [row.lab.assignedToUserId] : [];
    // Search is discovery, not a report distribution channel. Draft and final findings stay in authorized detail.
    const content = '';
    const searchable = `${row.lab.analysisNumber} ${row.lab.analysisType} ${row.lab.status} ${content}`;

    return {
      id: `lab_analysis:${row.lab.id}`,
      canonicalId: row.lab.id,
      resourceType: 'lab_analysis',
      eventId: row.resource.eventId,
      title: `${row.lab.analysisNumber}: ${row.lab.analysisType}`,
      subtitle: `Lab Analysis · ${row.lab.status}`,
      content,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.lab.id, row.lab.analysisNumber],
      tags: ['lab', 'analysis', row.lab.status.toLowerCase(),'lab-safe-v1'],
      status: row.lab.status,
      requiredPermission: Permissions.LAB_READ,
      visibility: 'EVENT',
      unitIds: row.lab.assignedUnitId ? [row.lab.assignedUnitId] : (row.lab.requestedFromUnitId ? [row.lab.requestedFromUnitId] : []),
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds,
      route: `/events/${row.resource.eventId}/lab/${row.lab.id}`,
      createdAt: row.lab.createdAt ? row.lab.createdAt.getTime() : 0,
      updatedAt: row.lab.updatedAt ? row.lab.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ lab: labAnalyses, resource: resources })
      .from(labAnalyses)
      .innerJoin(resources, eq(labAnalyses.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if(r.resource.visibility!=='EVENT')continue;
      const doc = await this.buildDocument(db, 'lab_analysis', r.lab.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
