import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { events } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class EventSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['event'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      return null;
    }

    return this.mapToDocument(event);
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    if (eventId) {
      const [single] = await db
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);
      return single ? [this.mapToDocument(single)] : [];
    }

    const rows = await db.select().from(events);
    return rows.map((r) => this.mapToDocument(r));
  }

  private mapToDocument(event: typeof events.$inferSelect): SearchDocument {
    const desc = event.description || '';
    const searchableText = `${event.name} ${event.slug} ${desc}`;

    return {
      id: `event:${event.id}`,
      canonicalId: event.id,
      resourceType: 'event',
      eventId: event.id,
      title: event.name,
      subtitle: event.slug,
      content: desc,
      normalizedContent: normalizeSearchText(searchableText),
      identifiers: [event.id, event.slug],
      tags: ['event', event.status.toLowerCase()],
      status: event.status,
      requiredPermission: Permissions.EVENT_READ,
      visibility: 'EVENT',
      unitIds: [],
      ownerUserId: '',
      assignedUserIds: [],
      route: `/events/${event.id}`,
      createdAt: event.createdAt ? event.createdAt.getTime() : 0,
      updatedAt: event.updatedAt ? event.updatedAt.getTime() : 0,
    };
  }
}
