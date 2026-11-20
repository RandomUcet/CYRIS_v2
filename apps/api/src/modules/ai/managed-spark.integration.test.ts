import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, sql } from 'drizzle-orm';
import { closeDatabaseConnection, getDbClient, integrations, auditEvents, roleAssignments, rolePermissions, roles, type CyrisDatabase } from '@cyris/db';
import { AIProviderResponseSchema } from '@cyris/contracts';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { PERMISSION_CHECK_KEY } from '../authorization/decorators/require-permission.decorator.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import type { DatabaseService } from '../database/database.service.js';
import { IntegrationSecretService } from '../integrations/integration-secret.service.js';
import { requireVerifiedIsolatedDatabase } from '../../regression/isolated-postgres-harness.js';
import type { AIAdmissionService } from './ai-admission.service.js';
import { AIAdminController } from './ai-admin.controller.js';
import { AIGatewayService } from './ai-gateway.service.js';

const url = requireVerifiedIsolatedDatabase();
const chatModel = 'nvidia/Qwen3.8-27B-NVFP4';
const embeddingModel = 'Qwen/Qwen3-Embedding-8B';
const chatUrl = 'http://10.15.69.2:8000/v1';
const embedUrl = 'http://10.15.69.2:8001/v1';
const upgrade = readFileSync(new URL('../../../../../packages/db/migrations/0022_managed_spark.sql', import.meta.url), 'utf8').split('--> statement-breakpoint');
type Transaction = Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];

test('Spark administration is restricted to platform administrators', () => {
  assert.deepEqual(Reflect.getMetadata(PERMISSION_CHECK_KEY, AIAdminController), {
    permission: Permissions.PLATFORM_MANAGE, scope: PermissionScopes.PLATFORM,
  });
});

test('managed Spark works without hardware, survives upgrades and only accepts a switch', { skip: !url }, async t => {
  const db = getDbClient({ url: url!, max: 5 });
  const schema = sql.identifier('spark_test_' + randomUUID().replace(/-/g, ''));
  const user = { id: randomUUID(), status: 'ACTIVE' } as AuthenticatedUser;
  const admission = { run: async (_lane: string, _id: string, _ms: number, work: () => Promise<unknown>) => work() } as AIAdmissionService;
  const scoped = <T>(run: (tx: Transaction) => Promise<T>) => db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL search_path TO ${schema}, public`);
    return run(tx);
  });
  const services = (tx: Transaction) => {
    const database = { client: tx } as unknown as DatabaseService;
    const audit = new AuditService(database);
    const secrets = new IntegrationSecretService(database, {} as never, audit);
    return {
      controller: new AIAdminController(database, secrets, audit, admission),
      gateway: new AIGatewayService(database, secrets, admission),
    };
  };
  try {
    await db.execute(sql`CREATE SCHEMA ${schema}`);
    await scoped(async tx => {
      for (const table of ['integrations', 'integration_secrets', 'audit_events', 'outbox_events', 'roles', 'role_assignments', 'role_permissions']) {
        await tx.execute(sql`CREATE TABLE ${schema}.${sql.identifier(table)} (LIKE public.${sql.identifier(table)} INCLUDING ALL)`);
      }
      await tx.execute(sql`INSERT INTO integrations SELECT * FROM public.integrations WHERE system_profile = 'DGX_SPARK'`);
    });
    for (const legacy of [false, true]) {
      await t.test(legacy ? 'adopts the prior deployment ID and switch, preserving another host with the same name' : 'a clean migration creates an inactive profile', async () => {
        await scoped(async tx => {
          await tx.execute(sql`CREATE TEMP TABLE integrations (LIKE public.integrations INCLUDING DEFAULTS) ON COMMIT DROP`);
          await tx.execute(sql`SET LOCAL search_path TO pg_temp, ${schema}, public`);
          await tx.execute(sql`ALTER TABLE pg_temp.integrations DROP COLUMN system_profile`);
          const legacyId = randomUUID(), otherId = randomUUID();
          if (legacy) {
            await tx.execute(sql`INSERT INTO integrations (id,name,category,provider_type,enabled,config) VALUES
              (${legacyId}, 'Legacy Spark', 'AI_PROVIDER', 'OPENAI_COMPATIBLE', true, ${JSON.stringify({ endpoint: chatUrl + '/', chatModel })}::jsonb),
              (${otherId}, 'CYRIS DGX Spark', 'AI_PROVIDER', 'OPENAI_COMPATIBLE', false, '{"endpoint":"http://other.example/v1"}')`);
          }
          for (const command of upgrade) await tx.execute(sql.raw(command));
          const [spark] = await tx.select().from(integrations).where(eq(integrations.systemProfile, 'DGX_SPARK'));
          assert.ok(spark);
          assert.equal(spark.enabled, legacy);
          assert.deepEqual(spark.config, { endpoint: chatUrl, chatModel, embeddingEndpoint: embedUrl, embeddingModel, timeoutSeconds: 120, tlsVerify: true });
          if (legacy) {
            assert.equal(spark.id, legacyId);
            const [other] = await tx.select().from(integrations).where(eq(integrations.id, otherId));
            assert.equal(other?.systemProfile, null);
            assert.deepEqual(other?.config, { endpoint: 'http://other.example/v1' });
          }
        });
      });
    }
    const spark = await scoped(async tx => {
      const [first] = await services(tx).controller.listProviders();
      assert.equal(first?.systemProfile, 'DGX_SPARK');
      return AIProviderResponseSchema.parse(first);
    });
    const toggle = (id: string, enabled: boolean) => scoped(tx => services(tx).controller.updateProvider(id, { enabled }, user));
    await toggle(spark.id, false);

    await t.test('an ordinary account is denied; an explicit platform grant admits the same account', async () => {
      await scoped(async tx => {
        const database = { client: tx } as unknown as DatabaseService;
        const guard = new PermissionsGuard(new Reflector(), new AuthorizationService(database), new AuditService(database));
        const context = {
          getClass: () => AIAdminController, getHandler: () => AIAdminController.prototype.updateProvider,
          switchToHttp: () => ({ getRequest: () => ({ user, params: { id: spark.id }, headers: {} }) }),
        } as unknown as ExecutionContext;
        await assert.rejects(guard.canActivate(context), ForbiddenException);
        const roleId = randomUUID();
        await tx.insert(roles).values({ id: roleId, name: 'Platform administrator', slug: 'spark-test-admin' });
        await tx.insert(rolePermissions).values({ roleId, permissionKey: Permissions.PLATFORM_MANAGE, scope: PermissionScopes.PLATFORM });
        await tx.insert(roleAssignments).values({ roleId, userId: user.id });
        assert.equal(await guard.canActivate(context), true);
      });
    });

    await t.test('read-only deployment and disabled runtime diagnostics', async () => {
      await assert.rejects(scoped(tx => services(tx).controller.updateProvider(spark.id, { enabled: true, chatModel: 'wrong' }, user)), ConflictException);
      await assert.rejects(scoped(tx => services(tx).controller.updateProvider(spark.id, { systemProfile: null, enabled: true }, user)), ConflictException);
      await assert.rejects(scoped(tx => services(tx).controller.deleteProvider(spark.id, user)), ConflictException);
      await assert.rejects(scoped(tx => services(tx).controller.testConnection({ providerId: spark.id, endpoint: 'http://other.example' }, user)), BadRequestException);
      const requests: string[] = [];
      const mock = t.mock.method(globalThis, 'fetch', async (url: string) => {
        const path = String(url);
        requests.push(path);
        return Response.json({ data: [{ id: path === chatUrl + '/models' ? chatModel : embeddingModel }] });
      });
      try {
        const result = await scoped(tx => services(tx).controller.testConnection({ providerId: spark.id }, user));
        assert.equal(result.success, true);
        assert.deepEqual(requests, [chatUrl + '/models', embedUrl + '/models']);
        const saved = await scoped(tx => services(tx).controller.getProvider(spark.id));
        assert.ok(saved.lastCheckedAt);
        assert.equal(saved.status, 'OPERATIONAL');
        assert.equal(saved.enabled, false);
      } finally { mock.mock.restore(); }
    });

    await t.test('exclusive active provider, persistent switch, audit and no implicit fallback', async () => {
      const custom = await scoped(tx => services(tx).controller.createProvider({
        name: 'Other provider', endpoint: 'http://other.example/v1', chatModel: 'other', enabled: true,
      }, user));
      await assert.rejects(scoped(tx => services(tx).controller.createProvider({ name: 'Second Spark', endpoint: chatUrl, chatModel }, user)), ConflictException);
      await Promise.all([toggle(spark.id, true), toggle(custom.id, true)]);
      assert.equal((await scoped(tx => services(tx).controller.listProviders())).filter(p => p.enabled).length, 1);
      await toggle(spark.id, true);
      assert.equal((await scoped(tx => services(tx).gateway.getActiveProvider()))?.integrationId, spark.id);
      await toggle(spark.id, false);
      assert.equal(await scoped(tx => services(tx).gateway.getActiveProvider()), null);
      assert.equal((await scoped(tx => services(tx).controller.getProvider(custom.id))).enabled, false);
      const logs = await scoped(tx => tx.select().from(auditEvents).where(and(eq(auditEvents.resourceId, spark.id), eq(auditEvents.action, 'integration.provider.updated'))));
      assert.ok(logs.some(row => (row.metadata as { enabled: boolean }).enabled === false));
    });
  } finally {
    try { await db.execute(sql`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await closeDatabaseConnection(); }
  }
});
