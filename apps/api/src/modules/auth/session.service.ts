import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { QueueService } from '../queue/queue.service.js';
import { DatabaseService } from '../database/database.service.js';
import { users, UserStatus, previewTeamAccounts } from '@cyris/db';

export function testAccountUsable(expiry:Date|null|undefined,now=Date.now()){return expiry==null||expiry.getTime()>now;}

export interface SessionData {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  previewGeneration?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
}

export interface ValidatedSession {
  session: SessionData;
  user: AuthenticatedUser;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly defaultTtlSeconds = 7 * 24 * 60 * 60; // 7 days

  constructor(
    private readonly queueService: QueueService,
    private readonly databaseService: DatabaseService
  ) {}

  private get redis() {
    return this.queueService.client;
  }

  /**
   * Generates a cryptographically secure opaque session token.
   */
  private generateOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Creates a new session in Redis and registers it in the user's session set.
   */
  async createSession(userId: string, ttlSeconds = this.defaultTtlSeconds): Promise<string> {
    const [preview] = await this.databaseService.client.select().from(previewTeamAccounts)
      .where(eq(previewTeamAccounts.userId, userId)).limit(1);
    if (preview && !preview.enabled) throw new UnauthorizedException('Invalid credentials or account disabled');
    const [account]=await this.databaseService.client.select({status:users.status,testExpiresAt:users.testExpiresAt}).from(users).where(eq(users.id,userId)).limit(1);
    if(!account||account.status!==UserStatus.ACTIVE||!testAccountUsable(account.testExpiresAt))throw new UnauthorizedException('Invalid credentials or account disabled');
    if(account.testExpiresAt)ttlSeconds=Math.max(1,Math.min(ttlSeconds,Math.ceil((account.testExpiresAt.getTime()-Date.now())/1000)));
    const token = this.generateOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const sessionData: SessionData = {
      id: token,
      ...(preview && { previewGeneration: preview.generation }),
      userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const sessionKey = `cyris:session:${token}`;
    const userSessionsKey = `cyris:user_sessions:${userId}`;

    await this.redis
      .multi()
      .set(sessionKey, JSON.stringify(sessionData), 'EX', ttlSeconds)
      .sadd(userSessionsKey, token)
      .exec();

    return token;
  }

  /**
   * Validates an opaque session token, ensuring the user is ACTIVE in PostgreSQL.
   * Revokes the session immediately if the user is disabled.
   */
  async validateSession(token?: string): Promise<ValidatedSession | null> {
    if (!token) return null;

    const sessionKey = `cyris:session:${token}`;
    const raw = await this.redis.get(sessionKey);
    if (!raw) return null;

    let session: SessionData;
    try {
      session = JSON.parse(raw) as SessionData;
    } catch {
      await this.revokeSession(token);
      return null;
    }

    // Server-side user status verification
    const db = this.databaseService.client;
    const [account] = await db
      .select({
        previewEnabled: previewTeamAccounts.enabled,
        previewGeneration: previewTeamAccounts.generation,
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
        testExpiresAt:users.testExpiresAt,
      })
      .from(users)
      .leftJoin(previewTeamAccounts, eq(users.id, previewTeamAccounts.userId))
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!account || account.status !== UserStatus.ACTIVE || account.previewEnabled === false || !testAccountUsable(account.testExpiresAt) ||
      (account.previewGeneration !== null && account.previewGeneration !== session.previewGeneration)) {
      this.logger.warn(`Revoking active session for deleted or disabled user: ${session.userId}`);
      await this.revokeSession(token);
      return null;
    }

    const { id, email, displayName, status } = account;
    return { session, user: { id, email, displayName, status } };
  }

  /**
   * Rotates a session token upon login to prevent session fixation.
   */
  async rotateSession(oldToken: string | undefined, userId: string): Promise<string> {
    const next = await this.createSession(userId);
    if (oldToken) await this.revokeSession(oldToken);
    return next;
  }

  /**
   * Revokes a single session.
   */
  async revokeSession(token: string): Promise<void> {
    const sessionKey = `cyris:session:${token}`;
    const raw = await this.redis.get(sessionKey);
    if (raw) {
      try {
        const session = JSON.parse(raw) as SessionData;
        await this.redis.srem(`cyris:user_sessions:${session.userId}`, token);
      } catch {
        // ignore parse errors during revocation
      }
    }
    await this.redis.del(sessionKey);
  }

  /**
   * Revokes all active sessions for a user (e.g. after password reset or account suspension).
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    const userSessionsKey = `cyris:user_sessions:${userId}`;
    const tokens = await this.redis.smembers(userSessionsKey);
    if (tokens.length > 0) {
      const sessionKeys = tokens.map((t) => `cyris:session:${t}`);
      await this.redis.del(...sessionKeys);
    }
    await this.redis.del(userSessionsKey);
  }
}
