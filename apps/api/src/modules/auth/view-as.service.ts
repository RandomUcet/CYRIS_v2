import { Injectable, ForbiddenException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { users, eventMemberships, MembershipStatus } from '@cyris/db';
import { Permissions } from '@cyris/shared';
import type { StartViewAsRequest, ViewAsInfo } from '@cyris/contracts';
import { DatabaseService } from '../database/database.service.js';
import { QueueService } from '../queue/queue.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from './session.service.js';

interface PreviewRecord { binding: string; info: ViewAsInfo }
export const PREVIEW_COOKIE = 'cyris_preview';
const ttl = 15 * 60;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class ViewAsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queue: QueueService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}
  private key(token: string) { return 'cyris:preview:' + hash(token); }
  private async read(token: string, originalSession: string): Promise<PreviewRecord | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const raw = await this.queue.client.get(this.key(token));
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as PreviewRecord;
      return record.binding === hash(originalSession) ? record : null;
    } catch { return null; }
  }
  private async requireAdmin(actor: AuthenticatedUser) {
    if (!await this.authz.authorize({ user: actor, permission: Permissions.PLATFORM_MANAGE })) {
      throw new ForbiddenException('Preview requires platform administration');
    }
  }
  private async target(userId: string, eventId: string): Promise<AuthenticatedUser> {
    const [row] = await this.db.client.select({
      id: users.id, email: users.email, displayName: users.displayName, status: users.status,
    }).from(users).innerJoin(eventMemberships, eq(users.id, eventMemberships.userId))
      .where(and(eq(users.id, userId), eq(users.status, 'ACTIVE'),
        eq(eventMemberships.eventId, eventId), eq(eventMemberships.status, MembershipStatus.ACTIVE))).limit(1);
    if (!row || await this.authz.authorize({ user: row, permission: Permissions.PLATFORM_MANAGE })) {
      throw new ForbiddenException('Preview requires an active non-administrator event member');
    }
    return row;
  }
  async start(actor: AuthenticatedUser, session: string, input: StartViewAsRequest) {
    await this.requireAdmin(actor);
    if (actor.id === input.userId) throw new ForbiddenException('Select another user');
    const target = await this.target(input.userId, input.eventId);
    const token = randomBytes(32).toString('hex');
    const info: ViewAsInfo = {actorUserId: actor.id, userId: target.id, eventId: input.eventId,
      displayName: target.displayName, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), readOnly: true};
    await this.audit.record({action:'auth.preview.start', category:'auth', actorUserId: actor.id,
      eventId: input.eventId, resourceType:'user', resourceId: target.id, metadata:{reason:input.reason, expiresAt:info.expiresAt}});
    await this.queue.client.set(this.key(token), JSON.stringify({binding:hash(session),info}), 'EX', ttl + 24*60*60);
    return { token, info };
  }
  async resolve(actor: AuthenticatedUser, session: string, token: string) {
    await this.requireAdmin(actor);
    const record = await this.read(token, session);
    if (!record || record.info.actorUserId !== actor.id || Date.parse(record.info.expiresAt) <= Date.now()) {
      throw new ForbiddenException('Preview expired; exit preview before continuing');
    }
    return {info:record.info, user:await this.target(record.info.userId, record.info.eventId)};
  }
  async stop(actor: AuthenticatedUser, session: string, token: string) {
    const record = await this.read(token, session);
    if (!record || record.info.actorUserId !== actor.id) return;
    if (await this.queue.client.del(this.key(token))) {
      await this.audit.record({action:'auth.preview.stop',category:'auth',actorUserId:actor.id,
        eventId:record.info.eventId,resourceType:'user',resourceId:record.info.userId});
    }
  }
}
