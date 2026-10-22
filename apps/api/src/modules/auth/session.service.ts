import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { QueueService } from '../queue/queue.service.js';
import { DatabaseService } from '../database/database.service.js';
import { users, UserStatus } from '@cyris/db';

export interface SessionData {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
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
    const token = this.generateOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const sessionData: SessionData = {
      id: token,
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
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user || user.status !== UserStatus.ACTIVE) {
      this.logger.warn(`Revoking active session for deleted or disabled user: ${session.userId}`);
      await this.revokeSession(token);
      return null;
    }

    return { session, user };
  }

  /**
   * Rotates a session token upon login to prevent session fixation.
   */
  async rotateSession(oldToken: string | undefined, userId: string): Promise<string> {
    if (oldToken) {
      await this.revokeSession(oldToken);
    }
    return this.createSession(userId);
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
