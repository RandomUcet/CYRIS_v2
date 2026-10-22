import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { technicalIndicators, resources } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class TechnicalIndicatorSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['technical_indicator', 'indicator'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ indicator: technicalIndicators, resource: resources })
      .from(technicalIndicators)
      .innerJoin(resources, eq(technicalIndicators.id, resources.id))
      .where(eq(technicalIndicators.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const content = row.indicator.description || '';
    const searchable = `${row.indicator.value} ${row.indicator.normalizedValue} ${row.indicator.indicatorType} ${row.indicator.verificationState} ${content}`;

    return {
      id: `technical_indicator:${row.indicator.id}`,
      canonicalId: row.indicator.id,
      resourceType: 'technical_indicator',
      eventId: row.resource.eventId,
      title: `${row.indicator.indicatorType}: ${row.indicator.value}`,
      subtitle: `Indicator · ${row.indicator.verificationState}`,
      content,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.indicator.id, row.indicator.value, row.indicator.normalizedValue],
      tags: ['indicator', 'technical', row.indicator.indicatorType.toLowerCase(), row.indicator.verificationState.toLowerCase()],
      status: row.indicator.verificationState,
      requiredPermission: Permissions.INDICATOR_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: row.resource.owningUnitId ? [row.resource.owningUnitId] : [],
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: [],
      route: `/events/${row.resource.eventId}/forensics/indicators?id=${row.indicator.id}`,
      createdAt: row.indicator.createdAt ? row.indicator.createdAt.getTime() : 0,
      updatedAt: row.indicator.updatedAt ? row.indicator.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ indicator: technicalIndicators, resource: resources })
      .from(technicalIndicators)
      .innerJoin(resources, eq(technicalIndicators.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'technical_indicator', r.indicator.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
