import { getDbClient, closeDatabaseConnection, sql } from '@cyris/db';
import * as argon2 from 'argon2';
import { generateId, Permissions, PermissionScopes } from '@cyris/shared';
import { UnitCapabilityKeys } from '@cyris/contracts';
import { execSync } from 'node:child_process';

/**
 * CYRIS v2 — System Seed Script
 * ==============================================================================
 * Enforces a CLEAN, UNPOLLUTED database baseline.
 * 
 * Cleans all demo/synthetic operational data:
 * - persons, organisations, locations, vehicles, devices
 * - incidents, cases, charges
 * - evidence, custody transfers
 * - lab analyses, forensic analyses, findings
 * - operational tasks, medical encounters, court cases
 * - evaluation observations, generated notifications, activity timeline
 * - resources and relationships
 * - documents, technical indicators, scenario injects/deliveries
 * 
 * Preserves & provisions ONLY:
 * - platform administrator (admin@cyris.local)
 * - platform roles (platform-admin with platform.manage)
 * - canonical exercise editions (Czech Cybertron 2027 ACTIVE, Czech Cybertron 2028 DRAFT)
 * - canonical organizational units with capability catalog mappings
 * - clean event-level role templates
 * ==============================================================================
 */

async function seedSystem(): Promise<void> {
  console.log('================================================================');
  console.log('  CYRIS v2 — Baseline System Seeder (Phase 2.5)');
  console.log('================================================================\n');

  const db = getDbClient();

  console.log('[1/6] Purging demo & synthetic operational records...');

  // 1. Delete all operational domain data in reverse dependency order
  const operationalTables = [
    'charges',
    'court_decisions',
    'court_exhibits',
    'court_hearings',
    'court_filings',
    'court_case_parties',
    'court_cases',
    'medical_interventions',
    'medical_observations',
    'medical_encounters',
    'operational_tasks',
    'forensic_findings',
    'forensic_acquisitions',
    'forensic_analysis_evidence',
    'forensic_analysis_devices',
    'forensic_analyses',
    'lab_analysis_evidence',
    'lab_analyses',
    'evidence_custody_transfers',
    'evidence',
    'cases',
    'incidents',
    'evaluation_observations',
    'evaluation_criteria',
    'evaluation_objectives',
    'scenario_deliveries',
    'scenario_inject_actions',
    'scenario_inject_conditions',
    'scenario_inject_dependencies',
    'scenario_inject_releases',
    'scenario_inject_targets',
    'scenario_inject_translations',
    'scenario_injects',
    'scenario_phases',
    'document_versions',
    'documents',
    'technical_indicators',
    'activity_events',
    'notifications',
    'ai_runs',
    'resource_relationships',
    'resource_assignments',
    'resource_access_control',
    'resources',
    'devices',
    'vehicles',
    'locations',
    'organisations',
    'persons',
    'identifier_counters',
  ];

  // Disable audit trigger temporarily to purge synthetic audit records
  try {
    await db.execute(sql`ALTER TABLE audit_events DISABLE TRIGGER audit_events_immutable_trg;`);
    await db.execute(sql`TRUNCATE TABLE audit_events;`);
  } catch (err: any) {
    console.warn(`  Notice: Truncate audit_events: ${err.message}`);
  }

  for (const table of operationalTables) {
    try {
      await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE;`));
    } catch (err: any) {
      console.warn(`  Notice: Truncate ${table}: ${err.message}`);
    }
  }

  // Re-enable audit trigger
  try {
    await db.execute(sql`ALTER TABLE audit_events ENABLE TRIGGER audit_events_immutable_trg;`);
  } catch (err: any) {
    console.warn(`  Notice: Re-enable audit trigger: ${err.message}`);
  }
  console.log('  ✓ All operational tables truncated to 0 rows.');

  // 2. Clean synthetic / test users (preserve admin@cyris.local)
  console.log('[2/6] Cleaning synthetic test users...');
  await db.execute(sql`
    DELETE FROM user_identities 
    WHERE user_id IN (
      SELECT id FROM users WHERE email NOT IN ('admin@cyris.local')
    );
  `);
  await db.execute(sql`
    DELETE FROM role_assignments 
    WHERE user_id IN (
      SELECT id FROM users WHERE email NOT IN ('admin@cyris.local')
    );
  `);
  await db.execute(sql`
    DELETE FROM event_memberships 
    WHERE user_id IN (
      SELECT id FROM users WHERE email NOT IN ('admin@cyris.local', 'participant@cyris.local', 'specialist@cyris.local')
    );
  `);
  await db.execute(sql`
    DELETE FROM users 
    WHERE email NOT IN ('admin@cyris.local', 'participant@cyris.local', 'specialist@cyris.local');
  `);
  console.log('  ✓ Preserved baseline platform users.');

  // 3. Clean test events (keep czech-cybertron-2027 and czech-cybertron-2028)
  console.log('[3/6] Standardizing exercise event baselines...');
  await db.execute(sql`
    DELETE FROM events 
    WHERE slug NOT IN ('czech-cybertron-2027', 'czech-cybertron-2028');
  `);

  // Ensure Czech Cybertron 2027 exists (PREPARATION)
  const [existing2027] = await db.execute(sql`
    SELECT id FROM events WHERE slug = 'czech-cybertron-2027' LIMIT 1;
  `);

  let event2027Id = existing2027?.id as string;
  if (!event2027Id) {
    event2027Id = generateId();
    await db.execute(sql`
      INSERT INTO events (id, slug, name, description, status, default_locale, default_timezone, created_at, updated_at)
      VALUES (
        ${event2027Id}, 
        'czech-cybertron-2027', 
        'Český Cybertron 2027', 
        'National Cyber Defense & Investigation Exercise 2027', 
        'PREPARATION', 
        'cs', 
        'Europe/Prague', 
        NOW(), 
        NOW()
      );
    `);
  } else {
    await db.execute(sql`
      UPDATE events 
      SET status = 'PREPARATION', default_locale = 'cs', default_timezone = 'Europe/Prague', updated_at = NOW()
      WHERE id = ${event2027Id};
    `);
  }

  // Ensure Czech Cybertron 2028 exists (DRAFT)
  const [existing2028] = await db.execute(sql`
    SELECT id FROM events WHERE slug = 'czech-cybertron-2028' LIMIT 1;
  `);

  let event2028Id = existing2028?.id as string;
  if (!event2028Id) {
    event2028Id = generateId();
    await db.execute(sql`
      INSERT INTO events (id, slug, name, description, status, default_locale, default_timezone, created_at, updated_at)
      VALUES (
        ${event2028Id}, 
        'czech-cybertron-2028', 
        'Czech Cybertron 2028', 
        'Annual National Exercise 2028', 
        'DRAFT', 
        'cs', 
        'Europe/Prague', 
        NOW(), 
        NOW()
      );
    `);
  } else {
    await db.execute(sql`
      UPDATE events 
      SET status = 'DRAFT', default_locale = 'cs', default_timezone = 'Europe/Prague', updated_at = NOW()
      WHERE id = ${event2028Id};
    `);
  }
  console.log(`  ✓ Czech Cybertron 2027 configured: PREPARATION (${event2027Id})`);
  console.log(`  ✓ Czech Cybertron 2028 configured: DRAFT (${event2028Id})`);

  // 4. Ensure Platform Administrator credentials and platform-admin role
  console.log('[4/6] Verifying platform administrator security...');
  const [adminUser] = await db.execute(sql`
    SELECT id FROM users WHERE email = 'admin@cyris.local' LIMIT 1;
  `);

  let adminUserId = adminUser?.id as string;
  const adminPassword = process.env.CYRIS_ADMIN_PASSWORD || 'AdminPassword123!';
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  if (!adminUserId) {
    adminUserId = generateId();
    await db.execute(sql`
      INSERT INTO users (id, email, display_name, status, created_at, updated_at)
      VALUES (${adminUserId}, 'admin@cyris.local', 'Platform Administrator', 'ACTIVE', NOW(), NOW());
    `);
    await db.execute(sql`
      INSERT INTO user_identities (id, user_id, provider_type, provider_subject, password_hash, created_at, updated_at)
      VALUES (${generateId()}, ${adminUserId}, 'LOCAL', 'admin@cyris.local', ${passwordHash}, NOW(), NOW());
    `);
  } else {
    await db.execute(sql`
      UPDATE user_identities 
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE user_id = ${adminUserId} AND provider_type = 'LOCAL';
    `);
  }

  // Ensure platform-admin role with platform.manage
  let [platformAdminRole] = await db.execute(sql`
    SELECT id FROM roles WHERE slug = 'platform-admin' AND event_id IS NULL LIMIT 1;
  `);

  let platformAdminRoleId = platformAdminRole?.id as string;
  if (!platformAdminRoleId) {
    platformAdminRoleId = generateId();
    await db.execute(sql`
      INSERT INTO roles (id, event_id, name, slug, description, created_at, updated_at)
      VALUES (
        ${platformAdminRoleId}, 
        NULL, 
        'Platform Administrator', 
        'platform-admin', 
        'Full administrative control over the CYRIS platform', 
        NOW(), 
        NOW()
      );
    `);
  }

  // Ensure platform.manage permission
  const [existingPerm] = await db.execute(sql`
    SELECT id FROM role_permissions 
    WHERE role_id = ${platformAdminRoleId} 
      AND permission_key = ${Permissions.PLATFORM_MANAGE} 
      AND scope = ${PermissionScopes.PLATFORM}
    LIMIT 1;
  `);
  if (!existingPerm) {
    await db.execute(sql`
      INSERT INTO role_permissions (id, role_id, permission_key, scope, created_at)
      VALUES (${generateId()}, ${platformAdminRoleId}, ${Permissions.PLATFORM_MANAGE}, ${PermissionScopes.PLATFORM}, NOW());
    `);
  }

  // Ensure assignment to admin user
  const [existingAssignment] = await db.execute(sql`
    SELECT id FROM role_assignments 
    WHERE role_id = ${platformAdminRoleId} AND user_id = ${adminUserId} 
    LIMIT 1;
  `);
  if (!existingAssignment) {
    await db.execute(sql`
      INSERT INTO role_assignments (id, role_id, user_id, created_at)
      VALUES (${generateId()}, ${platformAdminRoleId}, ${adminUserId}, NOW());
    `);
  }

  // Ensure platform admin has membership in active events for convenience
  for (const evId of [event2027Id, event2028Id]) {
    const [membership] = await db.execute(sql`
      SELECT id FROM event_memberships WHERE event_id = ${evId} AND user_id = ${adminUserId} LIMIT 1;
    `);
    if (!membership) {
      await db.execute(sql`
        INSERT INTO event_memberships (id, event_id, user_id, status, joined_at, created_at, updated_at)
        VALUES (${generateId()}, ${evId}, ${adminUserId}, 'ACTIVE', NOW(), NOW(), NOW());
      `);
    }
  }
  console.log('  ✓ Platform Administrator (admin@cyris.local) active with platform-admin role.');

  // Ensure a reusable least-privilege event role for ordinary team members.
  let [teamMemberRole] = await db.execute(sql`
    SELECT id FROM roles
    WHERE event_id = ${event2027Id} AND slug = 'team-member'
    LIMIT 1;
  `);
  let teamMemberRoleId = teamMemberRole?.id as string;
  if (!teamMemberRoleId) {
    teamMemberRoleId = generateId();
    await db.execute(sql`
      INSERT INTO roles (id, event_id, name, slug, description, created_at, updated_at)
      VALUES (
        ${teamMemberRoleId},
        ${event2027Id},
        'Team Member',
        'team-member',
        'Least-privilege event access for ordinary operational team members',
        NOW(),
        NOW()
      );
    `);
  }

  const teamMemberPermissions = [
    { key: Permissions.EVENT_READ, scope: PermissionScopes.EVENT },
    { key: Permissions.UNIT_READ, scope: PermissionScopes.EVENT },
    { key: Permissions.REGISTRY_READ, scope: PermissionScopes.EVENT },
    { key: Permissions.TIMELINE_READ, scope: PermissionScopes.EVENT },
    { key: Permissions.BRIEFING_READ, scope: PermissionScopes.EVENT },
    { key: Permissions.BRIEFING_ACKNOWLEDGE, scope: PermissionScopes.EVENT },
    { key: Permissions.TASK_READ, scope: PermissionScopes.ASSIGNED },
    { key: Permissions.TASK_ACKNOWLEDGE, scope: PermissionScopes.ASSIGNED },
    { key: Permissions.TASK_WORK, scope: PermissionScopes.ASSIGNED },
    { key: Permissions.TASK_COMPLETE, scope: PermissionScopes.ASSIGNED },
  ];
  for (const permission of teamMemberPermissions) {
    const [existingPermission] = await db.execute(sql`
      SELECT id FROM role_permissions
      WHERE role_id = ${teamMemberRoleId}
        AND permission_key = ${permission.key}
        AND scope = ${permission.scope}
      LIMIT 1;
    `);
    if (!existingPermission) {
      await db.execute(sql`
        INSERT INTO role_permissions (id, role_id, permission_key, scope, created_at)
        VALUES (${generateId()}, ${teamMemberRoleId}, ${permission.key}, ${permission.scope}, NOW());
      `);
    }
  }
  console.log('  ✓ Ensured reusable Team Member event role.');

  // Laboratory role templates are additive: existing role permissions and
  // assignments are never replaced, so administrators can customize them.
  const laboratoryRoles = [
    {
      slug: 'laboratory-worker',
      name: 'Laboratory Worker',
      description: 'Processes laboratory work assigned to the member or unit',
      permissions: [
        { key: Permissions.LAB_READ, scope: PermissionScopes.ASSIGNED },
        { key: Permissions.LAB_ACCEPT, scope: PermissionScopes.ASSIGNED },
        { key: Permissions.LAB_WORK, scope: PermissionScopes.ASSIGNED },
        { key: Permissions.LAB_COMPLETE, scope: PermissionScopes.ASSIGNED },
      ],
    },
    {
      slug: 'laboratory-leader',
      name: 'Laboratory Leader',
      description: 'Coordinates laboratory workload within assigned units',
      permissions: [
        { key: Permissions.LAB_READ, scope: PermissionScopes.UNIT },
        { key: Permissions.LAB_REASSIGN, scope: PermissionScopes.UNIT },
        { key: Permissions.LAB_REQUEST, scope: PermissionScopes.UNIT },
      ],
    },
    {
      slug: 'excon',
      name: 'EXCON',
      description: 'Operational exercise control laboratory authority',
      permissions: [
        { key: Permissions.LAB_READ, scope: PermissionScopes.EVENT },
        { key: Permissions.LAB_REQUEST, scope: PermissionScopes.EVENT },
        { key: Permissions.LAB_ACCEPT, scope: PermissionScopes.EVENT },
        { key: Permissions.LAB_WORK, scope: PermissionScopes.EVENT },
        { key: Permissions.LAB_COMPLETE, scope: PermissionScopes.EVENT },
        { key: Permissions.LAB_APPROVE, scope: PermissionScopes.EVENT },
        { key: Permissions.LAB_REASSIGN, scope: PermissionScopes.EVENT },
        { key: Permissions.LAB_CORRECT, scope: PermissionScopes.EVENT },
      ],
    },
    {
      slug: 'laboratory-requester',
      name: 'Laboratory Requester',
      description: 'Requests laboratory analysis and reads own results',
      permissions: [
        { key: Permissions.LAB_REQUEST, scope: PermissionScopes.EVENT },
        { key: Permissions.LAB_READ, scope: PermissionScopes.OWN },
      ],
    },
  ];

  for (const template of laboratoryRoles) {
    const [existingRole] = await db.execute(sql`
      SELECT id FROM roles
      WHERE event_id = ${event2027Id} AND slug = ${template.slug}
      LIMIT 1;
    `);
    const roleId = (existingRole?.id as string | undefined) ?? generateId();
    if (!existingRole) {
      await db.execute(sql`
        INSERT INTO roles (id, event_id, name, slug, description, created_at, updated_at)
        VALUES (${roleId}, ${event2027Id}, ${template.name}, ${template.slug}, ${template.description}, NOW(), NOW());
      `);
    }
    for (const permission of template.permissions) {
      await db.execute(sql`
        INSERT INTO role_permissions (id, role_id, permission_key, scope, created_at)
        SELECT ${generateId()}, ${roleId}, ${permission.key}, ${permission.scope}, NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM role_permissions
          WHERE role_id = ${roleId}
            AND permission_key = ${permission.key}
            AND scope = ${permission.scope}
        );
      `);
    }
  }
  console.log('  ✓ Ensured configurable laboratory role templates.');

  // 5. Provision the official Czech Cybertron hierarchy idempotently.
  console.log('[5/6] Provisioning official organizational structure & capabilities for Czech Cybertron 2027...');
  const canonicalUnits = [
    {
      name: 'Bezpečnostně právní služby',
      slug: 'bezpecnostne-pravni-sluzby',
      kind: 'TEAM',
      description: 'Investigation, legal coordination, and case work',
      capabilities: [UnitCapabilityKeys.INVESTIGATION, UnitCapabilityKeys.INCIDENT_OPERATIONS, UnitCapabilityKeys.PROSECUTION],
    },
    {
      name: 'Laboratoř levandulového oleje',
      slug: 'laborator-levanduloveho-oleje',
      kind: 'TEAM',
      description: 'Laboratory examination and evidence handling',
      capabilities: [UnitCapabilityKeys.CHEMICAL_ANALYSIS, UnitCapabilityKeys.EVIDENCE],
    },
    {
      name: 'Kybernetický forenzní tým',
      slug: 'kyberneticky-forenzni-tym',
      kind: 'TEAM',
      description: 'Digital acquisition, extraction, and forensic analysis',
      capabilities: [UnitCapabilityKeys.DIGITAL_FORENSICS, UnitCapabilityKeys.EVIDENCE],
    },
    {
      name: 'Juniorská zpravodajská služba',
      slug: 'juniorska-zpravodajska-sluzba',
      kind: 'TEAM',
      description: 'Intelligence collection and investigation support',
      capabilities: [UnitCapabilityKeys.INVESTIGATION, UnitCapabilityKeys.TECHNICAL_OPERATIONS],
    },
    {
      name: 'Juniorský krizový štáb',
      slug: 'juniorsky-krizovy-stab',
      kind: 'TEAM',
      description: 'Exercise coordination, crisis management, and scenario control',
      capabilities: [UnitCapabilityKeys.CRISIS_MANAGEMENT, UnitCapabilityKeys.SCENARIO_CONTROL],
    },
    {
      name: 'Chemický forenzní tým',
      slug: 'chemicky-forenzni-tym',
      kind: 'TEAM',
      description: 'Chemical analysis and forensic evidence examination',
      capabilities: [UnitCapabilityKeys.CHEMICAL_ANALYSIS, UnitCapabilityKeys.EVIDENCE],
    },
    {
      name: 'Záchranná a zdravotní služba',
      slug: 'zachranna-a-zdravotni-sluzba',
      kind: 'TEAM',
      description: 'Medical response and operational health support',
      capabilities: [UnitCapabilityKeys.MEDICAL_OPERATIONS],
    },
  ];

  for (const u of canonicalUnits) {
    const [existing] = await db.execute(sql`
      SELECT id FROM organizational_units WHERE event_id = ${event2027Id} AND slug = ${u.slug} LIMIT 1;
    `);
    const unitId = (existing?.id as string | undefined) ?? generateId();
    if (!existing) {
      await db.execute(sql`
        INSERT INTO organizational_units (id, event_id, name, slug, kind, description, created_at, updated_at)
        VALUES (${unitId}, ${event2027Id}, ${u.name}, ${u.slug}, ${u.kind}, ${u.description}, NOW(), NOW());
      `);
    }

    for (const capKey of u.capabilities) {
      await db.execute(sql`
        INSERT INTO unit_capabilities (id, unit_id, capability_key, created_at, updated_at)
        VALUES (${generateId()}, ${unitId}, ${capKey}, NOW(), NOW())
        ON CONFLICT (unit_id, capability_key) DO NOTHING;
      `);
    }
  }
  console.log(`  ✓ Ensured ${canonicalUnits.length} official teams with capability mappings.`);

  // 5.5 Provision clean participant and specialist unit accounts for role verification
  console.log('[5.5/6] Provisioning clean participant and specialist unit accounts...');
  
  // Participant: Detective Jan Novak (Investigation Division)
  let [partUser] = await db.execute(sql`
    SELECT id FROM users WHERE email = 'participant@cyris.local' LIMIT 1;
  `);
  let partUserId = partUser?.id as string;
  if (!partUserId) {
    partUserId = generateId();
    await db.execute(sql`
      INSERT INTO users (id, email, display_name, status, created_at, updated_at)
      VALUES (${partUserId}, 'participant@cyris.local', 'Detective Jan Novak', 'ACTIVE', NOW(), NOW());
    `);
    await db.execute(sql`
      INSERT INTO user_identities (id, user_id, provider_type, provider_subject, password_hash, created_at, updated_at)
      VALUES (${generateId()}, ${partUserId}, 'LOCAL', 'participant@cyris.local', ${passwordHash}, NOW(), NOW());
    `);
  }
  // Event membership for participant in Czech Cybertron 2027
  let [partMembership] = await db.execute(sql`
    SELECT id FROM event_memberships WHERE event_id = ${event2027Id} AND user_id = ${partUserId} LIMIT 1;
  `);
  let partMembershipId = partMembership?.id as string;
  if (!partMembershipId) {
    partMembershipId = generateId();
    await db.execute(sql`
      INSERT INTO event_memberships (id, event_id, user_id, status, joined_at, created_at, updated_at)
      VALUES (${partMembershipId}, ${event2027Id}, ${partUserId}, 'ACTIVE', NOW(), NOW(), NOW());
    `);
  }
  // Assign participant to 'investigation' unit
  const [investigationUnit] = await db.execute(sql`
    SELECT id FROM organizational_units WHERE event_id = ${event2027Id} AND slug = 'juniorska-zpravodajska-sluzba' LIMIT 1;
  `);
  if (investigationUnit) {
    await db.execute(sql`
      DELETE FROM membership_unit_assignments WHERE membership_id = ${partMembershipId};
    `);
    await db.execute(sql`
      INSERT INTO membership_unit_assignments (id, membership_id, unit_id, created_at)
      VALUES (${generateId()}, ${partMembershipId}, ${investigationUnit.id}, NOW());
    `);
  }
  // Assign investigator role
  const [investigatorRole] = await db.execute(sql`
    SELECT id FROM roles WHERE event_id = ${event2027Id} AND slug = 'investigator' LIMIT 1;
  `);
  if (investigatorRole) {
    await db.execute(sql`
      DELETE FROM role_assignments WHERE membership_id = ${partMembershipId};
    `);
    await db.execute(sql`
      INSERT INTO role_assignments (id, role_id, membership_id, unit_id, created_at)
      VALUES (${generateId()}, ${investigatorRole.id}, ${partMembershipId}, ${investigationUnit?.id || null}, NOW());
    `);
  }

  // Specialist: Analyst Elena Varga (Digital Forensics Unit)
  let [specUser] = await db.execute(sql`
    SELECT id FROM users WHERE email = 'specialist@cyris.local' LIMIT 1;
  `);
  let specUserId = specUser?.id as string;
  if (!specUserId) {
    specUserId = generateId();
    await db.execute(sql`
      INSERT INTO users (id, email, display_name, status, created_at, updated_at)
      VALUES (${specUserId}, 'specialist@cyris.local', 'Analyst Elena Varga', 'ACTIVE', NOW(), NOW());
    `);
    await db.execute(sql`
      INSERT INTO user_identities (id, user_id, provider_type, provider_subject, password_hash, created_at, updated_at)
      VALUES (${generateId()}, ${specUserId}, 'LOCAL', 'specialist@cyris.local', ${passwordHash}, NOW(), NOW());
    `);
  }
  // Event membership for specialist in Czech Cybertron 2027
  let [specMembership] = await db.execute(sql`
    SELECT id FROM event_memberships WHERE event_id = ${event2027Id} AND user_id = ${specUserId} LIMIT 1;
  `);
  let specMembershipId = specMembership?.id as string;
  if (!specMembershipId) {
    specMembershipId = generateId();
    await db.execute(sql`
      INSERT INTO event_memberships (id, event_id, user_id, status, joined_at, created_at, updated_at)
      VALUES (${specMembershipId}, ${event2027Id}, ${specUserId}, 'ACTIVE', NOW(), NOW(), NOW());
    `);
  }
  // Assign specialist to 'forensics' unit
  const [forensicsUnit] = await db.execute(sql`
    SELECT id FROM organizational_units WHERE event_id = ${event2027Id} AND slug = 'kyberneticky-forenzni-tym' LIMIT 1;
  `);
  if (forensicsUnit) {
    await db.execute(sql`
      DELETE FROM membership_unit_assignments WHERE membership_id = ${specMembershipId};
    `);
    await db.execute(sql`
      INSERT INTO membership_unit_assignments (id, membership_id, unit_id, created_at)
      VALUES (${generateId()}, ${specMembershipId}, ${forensicsUnit.id}, NOW());
    `);
  }
  // Assign forensics role
  const [forensicsRole] = await db.execute(sql`
    SELECT id FROM roles WHERE event_id = ${event2027Id} AND slug = 'role-forensics-examiner' LIMIT 1;
  `);
  if (forensicsRole) {
    await db.execute(sql`
      DELETE FROM role_assignments WHERE membership_id = ${specMembershipId};
    `);
    await db.execute(sql`
      INSERT INTO role_assignments (id, role_id, membership_id, unit_id, created_at)
      VALUES (${generateId()}, ${forensicsRole.id}, ${specMembershipId}, ${forensicsUnit?.id || null}, NOW());
    `);
  }
  console.log('  ✓ Participant (participant@cyris.local) & Specialist (specialist@cyris.local) active.');

  // Verification accounts are created only by dedicated verification scripts.
  await db.execute(sql`
    DELETE FROM user_identities
    WHERE user_id IN (
      SELECT id FROM users
      WHERE email IN ('participant@cyris.local', 'specialist@cyris.local')
    );
  `);
  await db.execute(sql`
    DELETE FROM role_assignments
    WHERE user_id IN (
      SELECT id FROM users
      WHERE email IN ('participant@cyris.local', 'specialist@cyris.local')
    );
  `);
  await db.execute(sql`
    DELETE FROM event_memberships
    WHERE user_id IN (
      SELECT id FROM users
      WHERE email IN ('participant@cyris.local', 'specialist@cyris.local')
    );
  `);
  await db.execute(sql`
    DELETE FROM users
    WHERE email IN ('participant@cyris.local', 'specialist@cyris.local');
  `);
  console.log('  ✓ Removed temporary participant and specialist verification accounts.');

  // Remove only verification artifacts. Legitimate integrations are persistent
  // administrator configuration and must survive a normal local startup.
  console.log('[6/6] Cleaning and standardizing system integrations...');
  await db.execute(sql`
    DELETE FROM integrations WHERE name = 'Verification Probe Provider';
  `);

  // Provision the documented local Spark provider only when it is absent.
  // The insert is intentionally non-destructive: admin-edited configuration,
  // status, and credentials are never overwritten on subsequent starts.
  await db.execute(sql`
    INSERT INTO integrations (
      id,
      name,
      category,
      provider_type,
      enabled,
      status,
      config,
      created_at,
      updated_at
    )
    SELECT
      ${generateId()},
      'CYRIS DGX Spark',
      'AI_PROVIDER',
      'OPENAI_COMPATIBLE',
      true,
      'NOT_CONFIGURED',
      ${JSON.stringify({
        endpoint: 'http://10.15.69.2:8000/v1',
        chatModel: 'nvidia/Qwen3.8-27B-NVFP4',
        embeddingEndpoint: 'http://10.15.69.2:8001/v1',
        embeddingModel: 'Qwen/Qwen3-Embedding-8B',
        timeoutSeconds: 120,
        tlsVerify: false,
      })}::jsonb,
      NOW(),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM integrations
      WHERE name = 'CYRIS DGX Spark'
        AND category = 'AI_PROVIDER'
    );
  `);

  // Reindex Typesense search to flush deleted demo records
  console.log('\n[Post-Seed] Synchronizing search engine index...');
  try {
    execSync('pnpm search:reindex', { stdio: 'inherit' });
  } catch (err: any) {
    console.warn('  Notice: Search reindexing skipped or failed:', err.message);
  }

  await closeDatabaseConnection();
  console.log('\n================================================================');
  console.log('✓ System baseline successfully initialized!');
  console.log('  Database is clean, empty of demo records, and ready.');
  console.log('================================================================');
}

seedSystem().catch(async (err) => {
  console.error('[Error] System seeding failed:', err);
  await closeDatabaseConnection();
  process.exit(1);
});
