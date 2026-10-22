import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { users, userIdentities, UserStatus, IdentityProviderType } from '@cyris/db';
import type { IIdentityProvider, AuthenticatedIdentity } from './identity-provider.interface.js';

export interface LocalCredentials {
  identifier: string;
  secret: string;
}

@Injectable()
export class LocalIdentityProvider implements IIdentityProvider {
  readonly type = IdentityProviderType.LOCAL;
  private readonly logger = new Logger(LocalIdentityProvider.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Hashes a password string using Argon2id with secure defaults.
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Authenticates local credentials against user_identities and users table.
   */
  async authenticate(credentials: unknown): Promise<AuthenticatedIdentity | null> {
    const creds = credentials as LocalCredentials;
    if (!creds?.identifier || !creds?.secret) {
      return null;
    }

    const normalizedSubject = creds.identifier.trim().toLowerCase();
    const db = this.databaseService.client;

    // 1. Locate local identity by provider subject
    const [identityRecord] = await db
      .select({
        identity: userIdentities,
        user: users,
      })
      .from(userIdentities)
      .innerJoin(users, eq(userIdentities.userId, users.id))
      .where(
        and(
          eq(userIdentities.providerType, IdentityProviderType.LOCAL),
          eq(userIdentities.providerSubject, normalizedSubject)
        )
      )
      .limit(1);

    if (!identityRecord || !identityRecord.identity.passwordHash) {
      this.logger.debug(`Authentication failed: user identity not found for subject`);
      return null;
    }

    // 2. Verify account is not DISABLED
    if (identityRecord.user.status !== UserStatus.ACTIVE) {
      this.logger.warn(`Authentication denied: user account is disabled for subject`);
      return null;
    }

    // 3. Verify Argon2id hash
    try {
      const isValid = await argon2.verify(identityRecord.identity.passwordHash, creds.secret);
      if (!isValid) {
        this.logger.debug(`Authentication failed: invalid password for subject`);
        return null;
      }
    } catch (err) {
      this.logger.error(`Error during Argon2 hash verification: ${(err as Error).message}`);
      return null;
    }

    // 4. Update last login timestamp
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, identityRecord.user.id));

    return {
      userId: identityRecord.user.id,
      identityId: identityRecord.identity.id,
      providerType: IdentityProviderType.LOCAL,
      providerSubject: identityRecord.identity.providerSubject,
    };
  }
}
