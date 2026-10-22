import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { roles, events } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class RoleSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['role'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({
        role: roles,
        eventName: events.name,
      })
      .from(roles)
      .leftJoin(events, eq(roles.eventId, events.id))
      .where(eq(roles.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapToDocument(row.role, row.eventName);
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({
        role: roles,
        eventName: events.name,
      })
      .from(roles)
      .leftJoin(events, eq(roles.eventId, events.id));

    if (eventId) {
      const rows = await query.where(eq(roles.eventId, eventId));
      return rows.map((r) => this.mapToDocument(r.role, r.eventName));
    }

    const rows = await query;
    return rows.map((r) => this.mapToDocument(r.role, r.eventName));
  }

  private mapToDocument(
    role: typeof roles.$inferSelect,
    eventName?: string | null
  ): SearchDocument {
    const desc = role.description || '';
    const scopeContext = eventName ? ` · ${eventName}` : ' · Platform';
    const subtitle = `${role.slug}${scopeContext}`;
    const searchableText = `${role.name} ${role.slug} ${desc} ${eventName || ''}`;

    return {
      id: `role:${role.id}`,
      canonicalId: role.id,
      resourceType: 'role',
      eventId: role.eventId || '',
      title: role.name,
      subtitle,
      content: desc,
      normalizedContent: normalizeSearchText(searchableText),
      identifiers: [role.id, role.slug],
      tags: ['role', role.eventId ? 'event-role' : 'platform-role'],
      status: 'ACTIVE',
      requiredPermission: Permissions.ROLE_READ,
      visibility: role.eventId ? 'EVENT' : 'PLATFORM',
      unitIds: [],
      ownerUserId: '',
      assignedUserIds: [],
      route: role.eventId ? `/events/${role.eventId}/roles/${role.id}` : `/admin/roles/${role.id}`,
      createdAt: role.createdAt ? role.createdAt.getTime() : 0,
      updatedAt: role.updatedAt ? role.updatedAt.getTime() : 0,
    };
  }
}
