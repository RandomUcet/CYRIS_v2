import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { organizationalUnits, events } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class UnitSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['unit'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({
        unit: organizationalUnits,
        eventName: events.name,
      })
      .from(organizationalUnits)
      .leftJoin(events, eq(organizationalUnits.eventId, events.id))
      .where(eq(organizationalUnits.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapToDocument(row.unit, row.eventName);
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({
        unit: organizationalUnits,
        eventName: events.name,
      })
      .from(organizationalUnits)
      .leftJoin(events, eq(organizationalUnits.eventId, events.id));

    if (eventId) {
      const rows = await query.where(eq(organizationalUnits.eventId, eventId));
      return rows.map((r) => this.mapToDocument(r.unit, r.eventName));
    }

    const rows = await query;
    return rows.map((r) => this.mapToDocument(r.unit, r.eventName));
  }

  private mapToDocument(
    unit: typeof organizationalUnits.$inferSelect,
    eventName?: string | null
  ): SearchDocument {
    const desc = unit.description || '';
    const eventContext = eventName ? ` · ${eventName}` : '';
    const subtitle = `${unit.kind} (${unit.slug})${eventContext}`;
    const searchableText = `${unit.name} ${unit.slug} ${unit.kind} ${desc} ${eventName || ''}`;

    return {
      id: `unit:${unit.id}`,
      canonicalId: unit.id,
      resourceType: 'unit',
      eventId: unit.eventId,
      title: unit.name,
      subtitle,
      content: desc,
      normalizedContent: normalizeSearchText(searchableText),
      identifiers: [unit.id, unit.slug],
      tags: ['unit', unit.kind.toLowerCase()],
      status: unit.archivedAt ? 'ARCHIVED' : 'ACTIVE',
      requiredPermission: Permissions.UNIT_READ,
      visibility: 'UNIT',
      unitIds: [unit.id],
      ownerUserId: '',
      assignedUserIds: [],
      route: `/events/${unit.eventId}/units/${unit.id}`,
      createdAt: unit.createdAt ? unit.createdAt.getTime() : 0,
      updatedAt: unit.updatedAt ? unit.updatedAt.getTime() : 0,
    };
  }
}
