import { sql, type CyrisDatabase } from '@cyris/db';
import { generateId, Permissions, PermissionScopes } from '@cyris/shared';
import { UnitCapabilityKeys } from '@cyris/contracts';

export interface BootstrapOptions {
  eventId?: string;
  eventSlug?: string;
  eventName?: string;
}

export function readBootstrapOptions(env: Record<string, string | undefined>): BootstrapOptions {
  const eventId = env.CYRIS_SEED_EVENT_ID?.trim() || undefined;
  const eventSlug = env.CYRIS_SEED_EVENT_SLUG?.trim() || undefined;
  const eventName = env.CYRIS_SEED_EVENT_NAME?.trim() || undefined;
  if (eventId && eventSlug) throw new Error('Select an exercise by ID or slug, not both.');
  if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new Error('CYRIS_SEED_EVENT_ID must be a UUID.');
  }
  if (eventSlug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventSlug) || eventSlug.length > 128)) {
    throw new Error('CYRIS_SEED_EVENT_SLUG must contain lowercase letters, numbers and single hyphens (max 128 characters).');
  }
  if (eventName && (!eventSlug || eventName.length > 255)) {
    throw new Error('CYRIS_SEED_EVENT_NAME requires an exercise slug and must be at most 255 characters.');
  }
  return { eventId, eventSlug, eventName };
}

/**
 * Serializes bootstrap attempts and inserts missing templates in one transaction.
 * Existing roles and teams are administrator-owned: even removed permissions or
 * capabilities are not restored by a subsequent bootstrap.
 */
export async function bootstrapSystem(db: CyrisDatabase, options: BootstrapOptions = {}) {
  const selected = readBootstrapOptions({
    CYRIS_SEED_EVENT_ID: options.eventId,
    CYRIS_SEED_EVENT_SLUG: options.eventSlug,
    CYRIS_SEED_EVENT_NAME: options.eventName,
  });
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cyris-system-bootstrap'));`);
    const [platformRole] = await tx.execute(sql`SELECT id FROM roles WHERE event_id IS NULL AND slug = 'platform-admin' LIMIT 1;`);
    if (!platformRole) {
      const roleId = generateId();
      await tx.execute(sql`
        INSERT INTO roles (id, name, slug, description)
        VALUES (${roleId}, 'Platform Administrator', 'platform-admin', 'Full administrative control over CYRIS');
      `);
      await tx.execute(sql`
        INSERT INTO role_permissions (id, role_id, permission_key, scope)
        VALUES (${generateId()}, ${roleId}, ${Permissions.PLATFORM_MANAGE}, ${PermissionScopes.PLATFORM});
      `);
    }

    let eventId = selected.eventId;
    if (eventId) {
      const [event] = await tx.execute(sql`SELECT id FROM events WHERE id = ${eventId} LIMIT 1;`);
      if (!event) throw new Error('The selected exercise does not exist.');
    } else if (selected.eventSlug) {
      const [event] = await tx.execute(sql`SELECT id FROM events WHERE slug = ${selected.eventSlug} LIMIT 1;`);
      if (event) {
        eventId = event.id as string;
      } else {
        if (!selected.eventName) throw new Error('Set CYRIS_SEED_EVENT_NAME to explicitly create the selected new exercise.');
        eventId = generateId();
        await tx.execute(sql`
          INSERT INTO events (id, slug, name, status, default_locale, default_timezone)
          VALUES (${eventId}, ${selected.eventSlug}, ${selected.eventName}, 'DRAFT', 'cs', 'Europe/Prague');
        `);
      }
    }

    let rolesCreated = 0;
    let unitsCreated = 0;
    if (!eventId) return { eventId: null, rolesCreated, unitsCreated };

    const templates = [
      {
        slug: 'team-member', name: 'Team Member',
        description: 'Least-privilege event access for operational team members',
        permissions: teamMemberPermissions,
      },
      {
        slug: 'exercise-organizer', name: 'Exercise Organizer',
        description: 'Exercise-scoped coordination, support and corrective authority; no platform administration',
        permissions: exerciseOrganizerPermissions,
      },
      ...laboratoryRoles,
    ];
    for (const template of templates) {
      const [existing] = await tx.execute(sql`SELECT id FROM roles WHERE event_id = ${eventId} AND slug = ${template.slug} LIMIT 1;`);
      if (existing) continue;
      const roleId = generateId();
      await tx.execute(sql`
        INSERT INTO roles (id, event_id, name, slug, description)
        VALUES (${roleId}, ${eventId}, ${template.name}, ${template.slug}, ${template.description});
      `);
      for (const permission of template.permissions) {
        await tx.execute(sql`
          INSERT INTO role_permissions (id, role_id, permission_key, scope)
          VALUES (${generateId()}, ${roleId}, ${permission.key}, ${permission.scope});
        `);
      }
      rolesCreated++;
    }

    for (const team of canonicalUnits) {
      const [existing] = await tx.execute(sql`SELECT id FROM organizational_units WHERE event_id = ${eventId} AND slug = ${team.slug} LIMIT 1;`);
      if (existing) continue;
      const unitId = generateId();
      await tx.execute(sql`
        INSERT INTO organizational_units (id, event_id, name, slug, kind, description)
        VALUES (${unitId}, ${eventId}, ${team.name}, ${team.slug}, ${team.kind}, ${team.description});
      `);
      for (const capability of team.capabilities) {
        await tx.execute(sql`
          INSERT INTO unit_capabilities (id, unit_id, capability_key)
          VALUES (${generateId()}, ${unitId}, ${capability});
        `);
      }
      unitsCreated++;
    }
    return { eventId, rolesCreated, unitsCreated };
  });
}


/** Explicit allowlist: new platform capabilities are never inherited by a seed. */
export const exerciseOrganizerPermissions = [
  Permissions.EVENT_READ, Permissions.EVENT_UPDATE, Permissions.EVENT_ARCHIVE,
  Permissions.MEMBERSHIP_READ, Permissions.MEMBERSHIP_MANAGE,
  Permissions.UNIT_READ, Permissions.UNIT_MANAGE, Permissions.ROLE_READ, Permissions.ROLE_MANAGE,
  Permissions.AUDIT_READ, Permissions.TIMELINE_READ,
  Permissions.REGISTRY_READ, Permissions.REGISTRY_CREATE, Permissions.REGISTRY_UPDATE, Permissions.REGISTRY_RELATIONSHIP_MANAGE,
  Permissions.INCIDENT_READ, Permissions.INCIDENT_CREATE, Permissions.INCIDENT_UPDATE, Permissions.INCIDENT_ASSIGN,
  Permissions.CASE_READ, Permissions.CASE_CREATE, Permissions.CASE_UPDATE, Permissions.CASE_ASSIGN, Permissions.CASE_CLOSE,
  Permissions.EVIDENCE_READ, Permissions.EVIDENCE_CREATE, Permissions.EVIDENCE_UPDATE, Permissions.EVIDENCE_TRANSFER,
  Permissions.LAB_READ, Permissions.LAB_REQUEST, Permissions.LAB_ACCEPT, Permissions.LAB_WORK,
  Permissions.LAB_COMPLETE, Permissions.LAB_APPROVE, Permissions.LAB_REASSIGN, Permissions.LAB_CORRECT,
  Permissions.INTELLIGENCE_USE,
  Permissions.SCENARIO_READ, Permissions.SCENARIO_MANAGE, Permissions.SCENARIO_RELEASE,
  Permissions.SCENARIO_SECRET_READ, Permissions.SCENARIO_OVERRIDE,
  Permissions.BRIEFING_READ, Permissions.BRIEFING_ACKNOWLEDGE,
  Permissions.DOCUMENT_READ, Permissions.DOCUMENT_CREATE, Permissions.DOCUMENT_UPDATE, Permissions.DOCUMENT_VERSION, Permissions.DOCUMENT_DELETE,
  Permissions.FORENSICS_READ, Permissions.FORENSICS_REQUEST, Permissions.FORENSICS_ACCEPT,
  Permissions.FORENSICS_WORK, Permissions.FORENSICS_COMPLETE, Permissions.FORENSICS_APPROVE,
  Permissions.INDICATOR_READ, Permissions.INDICATOR_CREATE, Permissions.INDICATOR_UPDATE,
  Permissions.COURT_READ, Permissions.COURT_CREATE, Permissions.COURT_UPDATE, Permissions.COURT_ASSIGN,
  Permissions.COURT_CHARGE_MANAGE, Permissions.COURT_EXHIBIT_READ, Permissions.COURT_EXHIBIT_SUBMIT,
  Permissions.COURT_EXHIBIT_DECIDE, Permissions.COURT_HEARING_MANAGE, Permissions.COURT_FILING_READ,
  Permissions.COURT_FILING_CREATE, Permissions.COURT_DECISION_CREATE, Permissions.COURT_DECISION_READ,
  Permissions.TASK_READ, Permissions.TASK_CREATE, Permissions.TASK_UPDATE, Permissions.TASK_ASSIGN,
  Permissions.TASK_ACKNOWLEDGE, Permissions.TASK_WORK, Permissions.TASK_COMPLETE, Permissions.TASK_CANCEL,
  Permissions.COMMAND_READ, Permissions.COMMAND_DEFCON_CHANGE,
  Permissions.MEDICAL_READ, Permissions.MEDICAL_CREATE, Permissions.MEDICAL_UPDATE, Permissions.MEDICAL_TRIAGE,
  Permissions.MEDICAL_OBSERVE, Permissions.MEDICAL_INTERVENE, Permissions.MEDICAL_TRANSFER, Permissions.MEDICAL_CLOSE,
  Permissions.EVALUATION_READ, Permissions.EVALUATION_MANAGE, Permissions.EVALUATION_OBSERVE,
  Permissions.EVALUATION_SCORE, Permissions.EVALUATION_LOCK, Permissions.EVALUATION_PUBLISH,
].map((key) => ({ key, scope: PermissionScopes.EVENT }));

export const teamMemberPermissions = [
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

export const laboratoryRoles = [
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

export const canonicalUnits = [
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
