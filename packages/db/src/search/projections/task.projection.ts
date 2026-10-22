import { eq } from 'drizzle-orm';
import type { SearchDocument } from '@cyris/contracts';
import { normalizeSearchText, Permissions } from '@cyris/shared';
import { operationalTasks, resources } from '../../schema/index.js';
import type { CyrisDb, SearchProjectionProvider } from '../projection.interface.js';

export class TaskSearchProjectionProvider implements SearchProjectionProvider {
  getSupportedTypes(): string[] {
    return ['operational_task', 'task'];
  }

  async buildDocument(db: CyrisDb, _type: string, id: string): Promise<SearchDocument | null> {
    const [row] = await db
      .select({ task: operationalTasks, resource: resources })
      .from(operationalTasks)
      .innerJoin(resources, eq(operationalTasks.id, resources.id))
      .where(eq(operationalTasks.id, id))
      .limit(1);

    if (!row) return null;
    if (row.resource.visibility === 'RESTRICTED' || row.resource.visibility === 'SCENARIO') {
      return null;
    }

    const content = [row.task.description, row.task.completionNote, row.task.blockedReason]
      .filter(Boolean)
      .join(' ');
    const searchable = `${row.task.taskNumber} ${row.task.title} ${row.task.priority} ${row.task.status} ${content}`;

    return {
      id: `operational_task:${row.task.id}`,
      canonicalId: row.task.id,
      resourceType: 'operational_task',
      eventId: row.resource.eventId,
      title: `${row.task.taskNumber}: ${row.task.title}`,
      subtitle: `Task · ${row.task.priority} · ${row.task.status}`,
      content,
      normalizedContent: normalizeSearchText(searchable),
      identifiers: [row.task.id, row.task.taskNumber],
      tags: ['task', 'operational', row.task.priority.toLowerCase(), row.task.status.toLowerCase()],
      status: row.task.status,
      requiredPermission: Permissions.TASK_READ,
      visibility: row.resource.visibility === 'UNIT' ? 'UNIT' : 'EVENT',
      unitIds: [row.task.assignedUnitId, row.task.owningUnitId, row.resource.owningUnitId].filter(
        (u): u is string => Boolean(u)
      ),
      ownerUserId: row.resource.ownerUserId || '',
      assignedUserIds: row.task.assignedUserId ? [row.task.assignedUserId] : [],
      route: `/events/${row.resource.eventId}/tasks?id=${row.task.id}`,
      createdAt: row.task.createdAt ? row.task.createdAt.getTime() : 0,
      updatedAt: row.task.updatedAt ? row.task.updatedAt.getTime() : 0,
    };
  }

  async listAllDocuments(db: CyrisDb, _type: string, eventId?: string): Promise<SearchDocument[]> {
    const query = db
      .select({ task: operationalTasks, resource: resources })
      .from(operationalTasks)
      .innerJoin(resources, eq(operationalTasks.id, resources.id));

    const rows = eventId
      ? await query.where(eq(resources.eventId, eventId))
      : await query;

    const docs: SearchDocument[] = [];
    for (const r of rows) {
      if (r.resource.visibility === 'RESTRICTED' || r.resource.visibility === 'SCENARIO') continue;
      const doc = await this.buildDocument(db, 'operational_task', r.task.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }
}
