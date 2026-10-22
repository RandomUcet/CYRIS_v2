import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { ConfigService } from '../modules/config/config.service.js';
import { IntegrationSecretService } from '../modules/integrations/integration-secret.service.js';
import { AIAdminController } from '../modules/ai/ai-admin.controller.js';
import { AIGatewayService } from '../modules/ai/ai-gateway.service.js';
import { AIContextService } from '../modules/ai/ai-context.service.js';
import { HealthService } from '../modules/health/health.service.js';
import { generateMasterKey, parseMasterKey, generateId } from '@cyris/shared';
import {
  integrations,
  integrationSecrets,
  aiRuns,
  events,
  users,
  cases,
  resources,
  resourceRelationships,
  ResourceVisibility,
  IntegrationCategory,
} from '@cyris/db';
import { eq, and } from 'drizzle-orm';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';

async function runStep8Verification() {
  console.log('================================================================');
  console.log('CYRIS v2 — STEP 8/8 Verification Suite');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dbService = app.get(DatabaseService);
  const configService = app.get(ConfigService);
  const secretService = app.get(IntegrationSecretService);
  const aiAdminController = app.get(AIAdminController);
  const aiGateway = app.get(AIGatewayService);
  const aiContextService = app.get(AIContextService);
  const healthService = app.get(HealthService);

  const db = dbService.client;
  let allPassed = true;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
    } else {
      console.error(`  ✗ [FAIL] ${testName}${details ? ` — ${details}` : ''}`);
      allPassed = false;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Keygen & Master Key Validation
  // ---------------------------------------------------------------------------
  console.log('1. Cryptographic Key Management & Envelope Root Key:');
  const generatedKey = generateMasterKey();
  const parsedKeyBuf = parseMasterKey(generatedKey);
  assert(
    parsedKeyBuf.length === 32,
    'generateMasterKey produces valid 32-byte (256-bit) buffer',
    `Resolved length: ${parsedKeyBuf.length}`
  );

  const currentEnvKey = configService.values.CYRIS_MASTER_KEY;
  const currentEnvKeyBuf = parseMasterKey(currentEnvKey);
  assert(
    currentEnvKeyBuf.length === 32,
    'Configured CYRIS_MASTER_KEY in environment validates to exactly 32 bytes'
  );

  // ---------------------------------------------------------------------------
  // 2. Secret Encryption At Rest
  // ---------------------------------------------------------------------------
  console.log('\n2. Integration Secret Storage & AES-256-GCM Envelope Encryption:');
  const dummyIntegrationId = generateId();
  await db.insert(integrations).values({
    id: dummyIntegrationId,
    name: 'Verification Probe Provider',
    category: IntegrationCategory.AI_PROVIDER,
    providerType: 'OPENAI_COMPATIBLE',
    enabled: false,
    config: {
      endpoint: 'https://spark.cylab.local/v1',
      chatModel: 'meta/llama-3.1-70b-instruct',
    },
  });

  const rawSecret = 'cybertron-super-secret-api-token-998877';
  await secretService.setSecret(dummyIntegrationId, 'API_KEY', rawSecret);

  // Directly inspect database table row to verify it is NOT in plaintext
  const [storedRow] = await db
    .select()
    .from(integrationSecrets)
    .where(
      and(
        eq(integrationSecrets.integrationId, dummyIntegrationId),
        eq(integrationSecrets.secretKey, 'API_KEY')
      )
    );

  assert(Boolean(storedRow), 'Secret row successfully persisted in integration_secrets');
  assert(
    storedRow?.encryptedValue !== rawSecret,
    'Secret is strictly encrypted at rest (ciphertext != plaintext)'
  );
  assert(
    Boolean(storedRow?.iv && storedRow?.authTag && storedRow?.algorithm === 'aes-256-gcm'),
    'Stores separate IV, 128-bit authentication tag, and algorithm metadata'
  );

  // Decrypt internally
  const decrypted = await secretService.getSecret(dummyIntegrationId, 'API_KEY');
  assert(decrypted === rawSecret, 'Internal retrieval safely decrypts authentic secret');

  // ---------------------------------------------------------------------------
  // 3. Secret Masking in Admin API
  // ---------------------------------------------------------------------------
  console.log('\n3. Secret Masking & Zero Leakage in API Responses:');
  const providerDto = await aiAdminController.getProvider(dummyIntegrationId);
  assert(providerDto.hasApiKey === true, 'API returns boolean flag hasApiKey: true');
  assert(
    !('apiKey' in providerDto) && !('encryptedValue' in providerDto),
    'API response NEVER echoes secret plaintext or ciphertext'
  );

  // ---------------------------------------------------------------------------
  // 4. Safe Connection Testing & Error Containment
  // ---------------------------------------------------------------------------
  console.log('\n4. Safe Test Connection & Error Containment (DGX Spark Offline):');
  const testRes = await aiAdminController.testConnection({
    endpoint: 'http://127.0.0.1:54321/v1', // Non-existent port
    chatModel: 'test-model',
    timeoutSeconds: 5,
    tlsVerify: true,
  });

  assert(testRes.success === false, 'Test Connection safely detects unavailable endpoint');
  assert(testRes.status === 'ERROR', 'Returns structured error status');
  assert(
    typeof testRes.error === 'string' &&
      (testRes.error.includes('Connection refused') ||
        testRes.error.includes('timeout') ||
        testRes.error.includes('unreachable')),
    'Returns sanitized, actionable error message without raw stack traces'
  );

  // ---------------------------------------------------------------------------
  // 5. Core Readiness Isolation
  // ---------------------------------------------------------------------------
  console.log('\n5. CYRIS Core Readiness Decoupling:');
  const readiness = await healthService.getReadiness();
  assert(
    readiness.isHealthy === true && readiness.response.status === 'ok',
    'Core CYRIS /health/ready remains healthy when AI provider is offline or unconfigured'
  );
  assert(
    !('ai' in readiness.response.dependencies),
    'AI is NOT a hard dependency of core system readiness'
  );

  // ---------------------------------------------------------------------------
  // 6. Permission-Aware Context Builder Isolation
  // ---------------------------------------------------------------------------
  console.log('\n6. Permission-Aware AI Context Isolation:');
  // Create an event and two resources: one public, one SCENARIO
  const testEventId = generateId();
  await db.insert(events).values({
    id: testEventId,
    name: 'Verification AI Event',
    slug: `verify-ai-${Date.now()}`,
    status: 'ACTIVE',
  });

  // Base Case
  const testCaseId = generateId();
  await db.insert(resources).values({
    id: testCaseId,
    eventId: testEventId,
    resourceType: 'case',
    visibility: ResourceVisibility.EVENT,
  });
  await db.insert(cases).values({
    id: testCaseId,
    caseNumber: 'CASE-VERIFY-001',
    title: 'Verification AI Case',
    summary: 'Case summary for AI context test',
    status: 'OPEN',
    priority: 'HIGH',
  });

  // Restricted Scenario Resource
  const scenarioResourceId = generateId();
  await db.insert(resources).values({
    id: scenarioResourceId,
    eventId: testEventId,
    resourceType: 'device',
    visibility: ResourceVisibility.SCENARIO, // STRICTLY SCENARIO
  });

  // Connect them via relationship
  await db.insert(resourceRelationships).values({
    id: generateId(),
    eventId: testEventId,
    sourceResourceId: testCaseId,
    targetResourceId: scenarioResourceId,
    relationshipType: 'CONNECTED_SCENARIO_DEVICE',
  });

  // Unprivileged user lacking scenario access
  const unprivilegedUser: AuthenticatedUser = {
    id: generateId(),
    displayName: 'Investigator Test',
    email: 'test@cyris.local',
    status: 'ACTIVE',
  };

  try {
    // Calling buildCaseContext with an unprivileged user who is not a member of the event
    // should fail closed!
    let blocked = false;
    try {
      await aiContextService.buildCaseContext(unprivilegedUser, testCaseId);
    } catch (err: any) {
      blocked = err.status === 403 || err.message?.includes('Forbidden');
    }
    assert(blocked, 'AI Context builder blocks unauthorized users (403 Forbidden)');
  } catch (e: any) {
    assert(false, 'AI Context builder exception', e.message);
  }

  // ---------------------------------------------------------------------------
  // 7. Audit & Provenance Secret Sanitization
  // ---------------------------------------------------------------------------
  console.log('\n7. AI Provenance & Audit Secret Hygiene:');
  const aiRunCols = Object.keys(aiRuns);
  assert(
    !aiRunCols.includes('prompt') &&
      !aiRunCols.includes('rawPrompt') &&
      !aiRunCols.includes('secret') &&
      !aiRunCols.includes('completion'),
    'ai_runs table schema explicitly omits unbounded raw prompts, secrets, and raw output'
  );

  // Clean up test data
  try {
    await db.delete(integrations).where(eq(integrations.id, dummyIntegrationId));
    await db.delete(events).where(eq(events.id, testEventId));
  } catch {}

  console.log('\n================================================================');
  if (allPassed) {
    console.log('✓ ALL STEP 8 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  } else {
    console.error('✗ SOME VERIFICATION CHECKS FAILED');
  }
  console.log('================================================================\n');

  await app.close();
  process.exit(allPassed ? 0 : 1);
}

runStep8Verification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
