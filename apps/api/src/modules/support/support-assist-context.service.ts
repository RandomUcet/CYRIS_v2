import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { events, IntegrationCategory, integrations, supportMessages, supportRequests, users } from '@cyris/db';
import type { SupportAssistInput } from '@cyris/contracts';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { DatabaseService } from '../database/database.service.js';
import { SupportService } from './support.service.js';

const threadFields = {
  id: supportRequests.id,
  requesterId: supportRequests.requesterId,
  subject: supportRequests.subject,
  status: supportRequests.status,
  category: supportRequests.category,
  revision: supportRequests.revision,
  updatedAt: supportRequests.updatedAt,
};
const HANDOVER_TICKETS = 12;
const RECENT_REPLY_MESSAGES = 6;
const REPLY_EXCERPT_CHARS = 650;
const HANDOVER_EXCERPT_CHARS = 400;

interface AssistThread {
  id: string;
  requesterId: string;
  subject: string;
  status: string;
  category: string;
  revision: number;
  updatedAt: string;
  excerpts: { author: string; body: string }[];
}

export interface SupportAssistContext {
  observedAt: string;
  localDate: string;
  event: { id: string; name: string; status: string; timezone: string };
  providerVersion: { id: string; updatedAt: string } | null;
  openCount: number | null;
  threads: AssistThread[];
}

function eventDate(now: Date, timezone: string) {
  try {
    return { timezone, localDate: new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(now) };
  } catch {
    // Historical event settings can contain an unrecognized timezone.
    return { timezone: 'UTC', localDate: now.toISOString().slice(0, 10) };
  }
}

@Injectable()
export class SupportAssistContextService {
  constructor(private readonly database: DatabaseService, private readonly support: SupportService) {}

  async read(eventId: string, user: AuthenticatedUser, input: SupportAssistInput): Promise<SupportAssistContext> {
    const cs = input.locale === 'cs';
    if (!await this.support.canManage(eventId, user)) {
      throw new ForbiddenException(cs ? 'Tato akce vyžaduje oprávnění EXCONu pro toto cvičení.' : 'This action requires EXCON access to this exercise.');
    }
    // A revision and its excerpts must come from the same committed conversation.
    return this.database.client.transaction(async tx => {
      const [event] = await tx.select({
        id: events.id, name: events.name, status: events.status, timezone: events.defaultTimezone,
        accountStatus: users.status,
      }).from(events).innerJoin(users, eq(users.id, user.id)).where(eq(events.id, eventId)).limit(1);
      if (!event) throw new NotFoundException('Exercise not found');
      if (event.accountStatus !== 'ACTIVE') throw new ForbiddenException('Account is no longer active');

      const threads: AssistThread[] = [];
      let openCount: number | null = null;
      if (input.action === 'REPLY') {
        const [row] = await tx.select(threadFields).from(supportRequests)
          .where(and(eq(supportRequests.eventId, eventId), eq(supportRequests.id, input.threadId))).limit(1);
        if (!row) throw new NotFoundException(cs ? 'Žádost v tomto cvičení nebyla nalezena.' : 'Support request not found in this exercise.');
        if (row.status === 'RESOLVED' || row.requesterId === user.id) {
          throw new ConflictException(cs ? 'Návrh odpovědi je dostupný u neuzavřených žádostí jiných účastníků.' : 'Draft a reply on an unresolved request from another participant.');
        }
        if (input.expectedRevision !== undefined && row.revision !== input.expectedRevision) {
          throw new ConflictException(cs ? 'Žádost se změnila. Obnovte ji a zkuste návrh znovu.' : 'The request changed. Refresh it before drafting a reply.');
        }
        const fields = {
          id: supportMessages.id, author: supportMessages.authorKind,
          body: sql<string>`left(${supportMessages.body}, ${REPLY_EXCERPT_CHARS})`,
        };
        const recent = await tx.select(fields).from(supportMessages).where(eq(supportMessages.requestId, row.id))
          .orderBy(desc(supportMessages.createdAt), desc(supportMessages.id)).limit(RECENT_REPLY_MESSAGES);
        recent.reverse();
        if (recent.length === RECENT_REPLY_MESSAGES) {
          const [first] = await tx.select(fields).from(supportMessages).where(eq(supportMessages.requestId, row.id))
            .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id)).limit(1);
          if (first && first.id !== recent[0]?.id) recent.unshift(first);
        }
        threads.push({
          id: row.id, requesterId: row.requesterId, subject: row.subject, category: row.category, status: row.status, revision: row.revision,
          updatedAt: row.updatedAt.toISOString(), excerpts: recent.map(({ author, body }) => ({ author, body })),
        });
      } else {
        // The indexed subquery reads one excerpt per selected request even with a large message history.
        const rows = await tx.select({
          ...threadFields,
          total: sql<number>`(count(*) over())::int`,
          latest: sql<string | null>`(select left(${supportMessages.body}, ${HANDOVER_EXCERPT_CHARS})
            from ${supportMessages} where ${supportMessages.requestId} = ${supportRequests.id}
            and ${supportMessages.authorKind} = 'PARTICIPANT'
            order by ${supportMessages.createdAt} desc, ${supportMessages.id} desc limit 1)`,
        }).from(supportRequests).where(and(eq(supportRequests.eventId, eventId), eq(supportRequests.status, 'OPEN')))
          .orderBy(asc(supportRequests.updatedAt), asc(supportRequests.id)).limit(HANDOVER_TICKETS);
        openCount = rows[0]?.total ?? 0;
        for (const { latest, total: _total, updatedAt, ...thread } of rows) {
          threads.push({ ...thread, updatedAt: updatedAt.toISOString(), excerpts: latest ? [{ author: 'PARTICIPANT', body: latest }] : [] });
        }
      }

      let providerVersion: SupportAssistContext['providerVersion'] = null;
      if (threads.length) {
        // Bind drafts to the active deployment without reading endpoints or credentials.
        const [provider] = await tx.select({ id: integrations.id, updatedAt: integrations.updatedAt }).from(integrations)
          .where(and(eq(integrations.category, IntegrationCategory.AI_PROVIDER), eq(integrations.enabled, true)))
          .orderBy(desc(integrations.updatedAt)).limit(1);
        if (!provider) throw new ServiceUnavailableException(cs ? 'AI není dostupná. Pokračujte ručně nebo to zkuste později.' : 'AI is unavailable. Continue manually or try again later.');
        providerVersion = { id: provider.id, updatedAt: provider.updatedAt.toISOString() };
      }
      const now = new Date();
      const { timezone, localDate } = eventDate(now, event.timezone);
      return {
        observedAt: now.toISOString(), localDate, event: { id: event.id, name: event.name, status: event.status, timezone },
        providerVersion, openCount, threads,
      };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }
}
