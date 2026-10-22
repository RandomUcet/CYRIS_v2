import { getDbClient, closeDatabaseConnection, sql } from '@cyris/db';
import { generateId, Permissions, PermissionScopes } from '@cyris/shared';
import { execSync } from 'node:child_process';

/**
 * CYRIS v2 — Demo Data Seeder
 * ==============================================================================
 * Explicitly provisions sample exercise operational records for development demos.
 * 
 * CRITICAL RULE:
 * This script must ONLY be invoked explicitly via:
 *   pnpm seed:demo
 * 
 * It must NEVER be invoked implicitly or automatically during normal build,
 * migration, or production deployment.
 * ==============================================================================
 */

async function seedDemo(): Promise<void> {
  console.log('================================================================');
  console.log('  CYRIS v2 — Explicit Demo Data Seeder');
  console.log('================================================================\n');

  const db = getDbClient();

  // Find active exercise
  const [event] = await db.execute(sql`
    SELECT id, name FROM events WHERE slug = 'czech-cybertron-2027' LIMIT 1;
  `);

  if (!event) {
    console.error('Error: Czech Cybertron 2027 event not found. Run "pnpm seed:system" first.');
    await closeDatabaseConnection();
    process.exit(1);
  }

  const eventId = event.id as string;
  console.log(`Targeting Exercise: ${event.name} (${eventId})\n`);

  console.log('[1/4] Seeding demo registry entities (persons, locations, vehicles)...');

  // Find admin user
  const [admin] = await db.execute(sql`
    SELECT id FROM users WHERE email = 'admin@cyris.local' LIMIT 1;
  `);
  const adminId = (admin?.id as string) || null;

  // Demo Person
  const personId = generateId();
  await db.execute(sql`
    INSERT INTO resources (id, event_id, resource_type, visibility, created_at, updated_at)
    VALUES (${personId}, ${eventId}, 'person', 'EVENT', NOW(), NOW());
  `);
  await db.execute(sql`
    INSERT INTO persons (id, event_id, full_name, callsign, identification_number, nationality, status, risk_level, notes, created_at, updated_at)
    VALUES (${personId}, ${eventId}, 'Viktor Černý', 'Viper', 'CZ-9012345678', 'CZE', 'ACTIVE', 'HIGH', 'Suspected coordinator of automated SCADA intrusion.', NOW(), NOW());
  `);

  // Demo Location
  const locationId = generateId();
  await db.execute(sql`
    INSERT INTO resources (id, event_id, resource_type, visibility, created_at, updated_at)
    VALUES (${locationId}, ${eventId}, 'location', 'EVENT', NOW(), NOW());
  `);
  await db.execute(sql`
    INSERT INTO locations (id, event_id, name, address, latitude, longitude, kind, security_level, created_at, updated_at)
    VALUES (${locationId}, ${eventId}, 'Central Power Substation Alpha', 'Průmyslová 14, Pardubice', 50.0385, 15.7792, 'FACILITY', 'RESTRICTED', NOW(), NOW());
  `);

  // Demo Vehicle
  const vehicleId = generateId();
  await db.execute(sql`
    INSERT INTO resources (id, event_id, resource_type, visibility, created_at, updated_at)
    VALUES (${vehicleId}, ${eventId}, 'vehicle', 'EVENT', NOW(), NOW());
  `);
  await db.execute(sql`
    INSERT INTO vehicles (id, event_id, license_plate, make, model, color, vin, notes, created_at, updated_at)
    VALUES (${vehicleId}, ${eventId}, '5AB 1234', 'Audi', 'A6 Avant', 'Dark Grey', 'WAUZZZ4G0EN123456', 'Observed conducting surveillance near substation.', NOW(), NOW());
  `);

  console.log('  ✓ Registry demo records seeded.');

  console.log('[2/4] Seeding demo incident and operational task...');
  // Demo Incident
  const incidentId = generateId();
  await db.execute(sql`
    INSERT INTO resources (id, event_id, resource_type, visibility, created_at, updated_at)
    VALUES (${incidentId}, ${eventId}, 'incident', 'EVENT', NOW(), NOW());
  `);
  await db.execute(sql`
    INSERT INTO incidents (id, event_id, incident_number, title, summary, status, severity, urgency, occurred_at, created_at, updated_at)
    VALUES (${incidentId}, ${eventId}, 'INC-0001', 'Anomalous SCADA Remote Telemetry Breach', 'Unauthorized SSH tunnel established into RTU network.', 'IN_PROGRESS', 'CRITICAL', 'CRITICAL', NOW(), NOW(), NOW());
  `);

  // Demo Task
  const taskId = generateId();
  await db.execute(sql`
    INSERT INTO resources (id, event_id, resource_type, visibility, created_at, updated_at)
    VALUES (${taskId}, ${eventId}, 'operational_task', 'EVENT', NOW(), NOW());
  `);
  await db.execute(sql`
    INSERT INTO operational_tasks (id, event_id, task_number, title, description, status, priority, created_at, updated_at)
    VALUES (${taskId}, ${eventId}, 'TSK-0001', 'Isolate SCADA Substation Gateway', 'Disconnect unmanaged LTE uplink router and capture volatile state.', 'PENDING', 'CRITICAL', NOW(), NOW());
  `);
  console.log('  ✓ Operational incident and task seeded.');

  console.log('[3/4] Seeding demo investigation case and physical evidence...');
  // Demo Case
  const caseId = generateId();
  await db.execute(sql`
    INSERT INTO resources (id, event_id, resource_type, visibility, created_at, updated_at)
    VALUES (${caseId}, ${eventId}, 'case', 'EVENT', NOW(), NOW());
  `);
  await db.execute(sql`
    INSERT INTO cases (id, event_id, case_number, title, summary, status, classification, created_at, updated_at)
    VALUES (${caseId}, ${eventId}, 'CASE-0001', 'Operation Iron Grid', 'Multi-vector cyber attack on regional electrical distribution infrastructure.', 'ACTIVE', 'SECRET', NOW(), NOW());
  `);

  // Demo Evidence
  const evidenceId = generateId();
  await db.execute(sql`
    INSERT INTO resources (id, event_id, resource_type, visibility, created_at, updated_at)
    VALUES (${evidenceId}, ${eventId}, 'evidence', 'EVENT', NOW(), NOW());
  `);
  await db.execute(sql`
    INSERT INTO evidence (id, event_id, evidence_number, name, description, category, status, storage_location, created_at, updated_at)
    VALUES (${evidenceId}, ${eventId}, 'EVD-0001', 'MikroTik LTE Router Gateway', 'Extracted from power substation perimeter cabinet with active external SIM.', 'PHYSICAL', 'STORED', 'Safe Vault Locker 04', NOW(), NOW());
  `);
  console.log('  ✓ Investigation case and evidence item seeded.');

  console.log('[4/4] Updating search index for demo records...');
  try {
    execSync('pnpm search:reindex', { stdio: 'inherit' });
  } catch (err: any) {
    console.warn('  Notice: Search reindexing skipped:', err.message);
  }

  await closeDatabaseConnection();
  console.log('\n================================================================');
  console.log('✓ Demo data seeded successfully for Czech Cybertron 2027.');
  console.log('  To reset back to clean empty baseline: pnpm seed:system');
  console.log('================================================================');
}

seedDemo().catch(async (err) => {
  console.error('[Error] Demo seeding failed:', err);
  await closeDatabaseConnection();
  process.exit(1);
});
