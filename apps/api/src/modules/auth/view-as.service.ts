import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { eventMemberships, previewTeamAccounts, resources, users } from '@cyris/db';
import { isPreviewReadAllowed } from './view-as-policy.js';
import { generateId, Permissions } from '@cyris/shared';
import type { StartViewAsRequest, ViewAsContext } from '@cyris/contracts';
import { DatabaseService } from '../database/database.service.js';
import { QueueService } from '../queue/queue.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import { testAccountUsable, type AuthenticatedUser } from './session.service.js';
import type { CyrisRequest } from './guards/auth.guard.js';

interface StoredPreview extends ViewAsContext { sessionHash: string }

/** A preview is bound to an administrator's session, never a target user's session. */
@Injectable()
export class ViewAsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queue: QueueService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private key(id: string) { return `cyris:view_as:${id}`; }
  private sessionHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private invalid(): never {
    // Never silently fall back to the administrator when a preview expires.
    throw new ForbiddenException({ code: 'VIEW_AS_INVALID', message: 'This preview has expired or is no longer available. Return to administration.' });
  }
  private publicContext(preview: StoredPreview): ViewAsContext {
    const { sessionHash: _, ...context } = preview;
    return context;
  }

  private async load(id: string, actor: AuthenticatedUser, token: string): Promise<StoredPreview> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) this.invalid();
    const raw = await this.queue.client.get(this.key(id));
    if (!raw) this.invalid();
    let preview: StoredPreview;
    try { preview = JSON.parse(raw); } catch { return this.invalid(); }
    if (preview.id !== id || preview.actorUserId !== actor.id || preview.sessionHash !== this.sessionHash(token)) this.invalid();
    return preview;
  }

  private async target(eventId: string, userId: string): Promise<AuthenticatedUser> {
    const [target] = await this.database.client.select({
      id: users.id, email: users.email, displayName: users.displayName, status: users.status,
      testExpiresAt: users.testExpiresAt, previewEnabled: previewTeamAccounts.enabled,
    }).from(users).leftJoin(previewTeamAccounts, eq(previewTeamAccounts.userId, users.id)).innerJoin(eventMemberships, eq(eventMemberships.userId, users.id))
      .where(and(eq(users.id, userId), eq(users.status, 'ACTIVE'),
        eq(eventMemberships.eventId, eventId), eq(eventMemberships.status, 'ACTIVE'))).limit(1);
    if (!target || target.previewEnabled === false || !testAccountUsable(target.testExpiresAt)) this.invalid();
    const { id, email, displayName, status } = target;
    const user = { id, email, displayName, status };
    if (await this.authz.authorize({ user, permission: Permissions.PLATFORM_MANAGE })) this.invalid();
    return user;
  }

  async start(actor: AuthenticatedUser, token: string, input: StartViewAsRequest, requestId?: string): Promise<ViewAsContext> {
    await this.authz.assertAuthorized({ user: actor, permission: Permissions.PLATFORM_MANAGE });
    if (input.targetUserId === actor.id) throw new BadRequestException('Select another participant to preview');
    const target = await this.target(input.eventId, input.targetUserId);
    const now = new Date();
    const preview: StoredPreview = {
      id: generateId(), eventId: input.eventId, actorUserId: actor.id,
      targetUserId: target.id, targetDisplayName: target.displayName,
      startedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      readOnly: true, sessionHash: this.sessionHash(token),
    };
    await this.audit.record({ action: 'auth.view_as.started', category: 'auth', actorUserId: actor.id,
      eventId: preview.eventId, requestId, metadata: { ...this.publicContext(preview), reason: input.reason } });
    // Retain the receipt beyond its 15-minute read window so exit can be audited.
    await this.queue.client.set(this.key(preview.id), JSON.stringify(preview), 'EX', 7 * 24 * 60 * 60);
    return this.publicContext(preview);
  }

  async stop(id: string, actor: AuthenticatedUser, token: string, requestId?: string): Promise<void> {
    const preview = await this.load(id, actor, token);
    await this.audit.record({ action: 'auth.view_as.ended', category: 'auth', actorUserId: actor.id,
      eventId: preview.eventId, requestId, metadata: this.publicContext(preview) });
    await this.queue.client.del(this.key(id));
  }

  async apply(req: CyrisRequest, actor: AuthenticatedUser, token: string): Promise<void> {
    const header = req.headers['x-cyris-view-as'];
    if (req.cookies?.cyris_preview || req.headers['x-cyris-read-only-preview']) this.invalid();
    if (header === undefined) return;
    if (typeof header !== 'string' || !header) this.invalid();
    const path = req.url.split('?')[0]!.replace(/\/+$/, '') || '/';
    // Only the original administrator can end their preview, even after expiry
    // or revocation of the target's membership. The controller verifies binding.
    if (path === '/auth/view-as' && req.method === 'DELETE') return;
    const preview = await this.load(header, actor, token);
    if (!(Date.parse(preview.expiresAt) > Date.now())) this.invalid();
    if (!await this.authz.authorize({ user: actor, permission: Permissions.PLATFORM_MANAGE })) this.invalid();
    const target = await this.target(preview.eventId, preview.targetUserId);

    let allowed = req.method === 'GET' || req.method === 'HEAD';
    const params = req.params as Record<string, string>;
    const query = req.query as Record<string, unknown>;
    if (params?.eventId) {
      const route = req.routeOptions?.url ?? path.replace('/events/' + params.eventId, '/events/:eventId');
      allowed &&= isPreviewReadAllowed(req.method, route, params.eventId, preview.eventId);
    } else if (path === '/search' || path === '/notifications') {
      allowed &&= query?.eventId === preview.eventId;
    } else if ((path.startsWith('/resources/') && params?.resourceId) || (path.startsWith('/cases/') && params?.caseId)) {
      const [resource] = await this.database.client.select({ eventId: resources.eventId })
        .from(resources).where(eq(resources.id, params.resourceId ?? params.caseId!)).limit(1);
      allowed &&= resource?.eventId === preview.eventId;
    } else {
      allowed &&= ['/auth/me', '/events', '/preferences/me'].includes(path);
    }
    if (query?.eventId !== undefined && query.eventId !== preview.eventId) allowed = false;
    await this.audit.record({
      action: allowed ? 'auth.view_as.read' : 'auth.view_as.blocked', category: 'auth',
      actorUserId: actor.id, eventId: preview.eventId, requestId: req.id,
      outcome: allowed ? 'SUCCESS' : 'FAILURE',
      metadata: { previewId: preview.id, targetUserId: target.id, method: req.method, path },
    });
    if (!allowed) throw new ForbiddenException({ code: 'VIEW_AS_READ_ONLY', message: 'Preview allows reading only within the selected exercise.' });
    req.viewAs = this.publicContext(preview);
    req.user = target;
  }
}
