import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ConfigService } from '../config/config.service.js';
import { AuditService } from '../audit/audit.service.js';
import { integrationSecrets, AuditOutcome } from '@cyris/db';
import { generateId, parseMasterKey, encryptSecret, decryptSecret } from '@cyris/shared';

type Transaction = Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];

@Injectable()
export class IntegrationSecretService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationSecretService.name);
  private masterKeyBuffer!: Buffer;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService
  ) {}

  onModuleInit(): void {
    const rawKey = this.configService.values.CYRIS_MASTER_KEY;
    try {
      this.masterKeyBuffer = parseMasterKey(rawKey);
      this.logger.log('CYRIS_MASTER_KEY validated successfully for AES-256-GCM envelope encryption.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Critical master key failure: ${msg}`);
      throw new Error(`IntegrationSecretService startup aborted: ${msg}`);
    }
  }

  /**
   * Encrypts and persists an integration secret.
   * Secrets are NEVER stored or logged in plaintext.
   */
  async setSecret(
    integrationId: string,
    secretKey: string,
    plaintext: string,
    actorUserId?: string,
    txClient?: Transaction
  ): Promise<void> {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      throw new Error('Secret value cannot be empty');
    }

    const payload = encryptSecret(plaintext, this.masterKeyBuffer, 1);
    const db = txClient ?? this.databaseService.client;

    await db
      .insert(integrationSecrets)
      .values({
        id: generateId(),
        integrationId,
        secretKey,
        encryptedValue: payload.encryptedValue,
        iv: payload.iv,
        authTag: payload.authTag,
        keyVersion: payload.keyVersion,
        algorithm: payload.algorithm,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [integrationSecrets.integrationId, integrationSecrets.secretKey],
        set: {
          encryptedValue: payload.encryptedValue,
          iv: payload.iv,
          authTag: payload.authTag,
          keyVersion: payload.keyVersion,
          algorithm: payload.algorithm,
          updatedAt: new Date(),
        },
      });

    // Record audit WITHOUT the secret or ciphertext
    await this.auditService.record({
      action: 'integration.secret.updated',
      txClient,
      category: 'SECURITY',
      actorUserId: actorUserId ?? null,
      resourceType: 'integration',
      resourceId: integrationId,
      outcome: AuditOutcome.SUCCESS,
      metadata: {
        integrationId,
        secretKey,
        keyVersion: payload.keyVersion,
        algorithm: payload.algorithm,
      },
    });
  }

  /**
   * Retrieves and decrypts a secret for internal runtime use.
   * NEVER expose this return value to HTTP controllers or logs.
   */
  async getSecret(integrationId: string, secretKey: string): Promise<string | null> {
    const db = this.databaseService.client;
    const [row] = await db
      .select({
        encryptedValue: integrationSecrets.encryptedValue,
        iv: integrationSecrets.iv,
        authTag: integrationSecrets.authTag,
        algorithm: integrationSecrets.algorithm,
      })
      .from(integrationSecrets)
      .where(
        and(
          eq(integrationSecrets.integrationId, integrationId),
          eq(integrationSecrets.secretKey, secretKey)
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    try {
      return decryptSecret(row, this.masterKeyBuffer);
    } catch (err) {
      this.logger.error(`Decryption failed for integration ${integrationId} secret ${secretKey}`);
      throw new Error('Cryptographic failure decrypting integration secret');
    }
  }

  /**
   * Checks whether a secret is configured for an integration without decrypting it.
   */
  async hasSecret(integrationId: string, secretKey: string, txClient?: Transaction): Promise<boolean> {
    const db = txClient ?? this.databaseService.client;
    const [row] = await db
      .select({ id: integrationSecrets.id })
      .from(integrationSecrets)
      .where(
        and(
          eq(integrationSecrets.integrationId, integrationId),
          eq(integrationSecrets.secretKey, secretKey)
        )
      )
      .limit(1);

    return Boolean(row);
  }

  /**
   * Removes an integration secret securely.
   */
  async deleteSecret(
    integrationId: string,
    secretKey: string,
    actorUserId?: string,
    txClient?: Transaction
  ): Promise<void> {
    const db = txClient ?? this.databaseService.client;
    await db
      .delete(integrationSecrets)
      .where(
        and(
          eq(integrationSecrets.integrationId, integrationId),
          eq(integrationSecrets.secretKey, secretKey)
        )
      );

    await this.auditService.record({
      action: 'integration.secret.deleted',
      txClient,
      category: 'SECURITY',
      actorUserId: actorUserId ?? null,
      resourceType: 'integration',
      resourceId: integrationId,
      outcome: AuditOutcome.SUCCESS,
      metadata: {
        integrationId,
        secretKey,
      },
    });
  }
}
