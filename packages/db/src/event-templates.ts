import { and, eq, sql } from 'drizzle-orm';
import { UnitCapabilityKeys, previewTeams } from '@cyris/contracts';
import { Permissions, PermissionScopes, type PermissionKey, type PermissionScope } from '@cyris/shared';
import type { CyrisDatabase } from './client.js';
import { organizationalUnits, unitCapabilities } from './schema/events.js';
import { roles, rolePermissions } from './schema/roles.js';

type Transaction = Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];

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
  Permissions.FORENSICS_WORK, Permissions.FORENSICS_COMPLETE, Permissions.FORENSICS_APPROVE, Permissions.FORENSICS_REASSIGN,
  Permissions.INDICATOR_READ, Permissions.INDICATOR_CREATE, Permissions.INDICATOR_UPDATE,
  Permissions.COURT_READ, Permissions.COURT_CREATE, Permissions.COURT_UPDATE, Permissions.COURT_ASSIGN,
  Permissions.COURT_CHARGE_MANAGE, Permissions.COURT_EXHIBIT_READ, Permissions.COURT_EXHIBIT_SUBMIT,
  Permissions.COURT_EXHIBIT_DECIDE, Permissions.COURT_HEARING_MANAGE, Permissions.COURT_FILING_READ,
  Permissions.COURT_FILING_CREATE, Permissions.COURT_DECISION_CREATE, Permissions.COURT_DECISION_READ,
  Permissions.COURT_REQUEST_READ, Permissions.COURT_REQUEST_CREATE, Permissions.COURT_REQUEST_RESPOND,
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

export const medicalResponderPermissions = [
  Permissions.MEDICAL_READ, Permissions.MEDICAL_CREATE, Permissions.MEDICAL_UPDATE,
  Permissions.MEDICAL_TRIAGE, Permissions.MEDICAL_OBSERVE,
  Permissions.MEDICAL_INTERVENE, Permissions.MEDICAL_TRANSFER, Permissions.MEDICAL_CLOSE,
].map(key => ({key, scope: PermissionScopes.UNIT}));

export const crisisCommandPermissions = [
  ...teamMemberPermissions.filter(({ key }) => key !== Permissions.REGISTRY_READ && key !== Permissions.TASK_READ),
  ...[Permissions.COMMAND_READ, Permissions.COMMAND_DEFCON_CHANGE, Permissions.TASK_CREATE,
    Permissions.TASK_ASSIGN, Permissions.TASK_READ, Permissions.INCIDENT_READ,
    Permissions.DOCUMENT_READ, Permissions.DOCUMENT_CREATE].map(key => ({ key, scope: PermissionScopes.EVENT })),
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

const unitSpecifications = {
    'bezpecnostne-pravni-sluzby': {
      kind: 'TEAM',
      description: 'Investigation, legal coordination, and case work',
      capabilities: [UnitCapabilityKeys.INVESTIGATION, UnitCapabilityKeys.INCIDENT_OPERATIONS, UnitCapabilityKeys.PROSECUTION],
    },
    'laborator-levanduloveho-oleje': {
      kind: 'TEAM',
      description: 'Laboratory examination and evidence handling',
      capabilities: [UnitCapabilityKeys.CHEMICAL_ANALYSIS, UnitCapabilityKeys.EVIDENCE],
    },
    'kyberneticky-forenzni-tym': {
      kind: 'TEAM',
      description: 'Digital acquisition, extraction, and forensic analysis',
      capabilities: [UnitCapabilityKeys.DIGITAL_FORENSICS, UnitCapabilityKeys.EVIDENCE],
    },
    'juniorska-zpravodajska-sluzba': {
      kind: 'TEAM',
      description: 'Intelligence collection and investigation support',
      capabilities: [UnitCapabilityKeys.INVESTIGATION, UnitCapabilityKeys.TECHNICAL_OPERATIONS],
    },
    'juniorsky-krizovy-stab': {
      kind: 'TEAM',
      description: 'Exercise coordination, crisis management, and scenario control',
      capabilities: [UnitCapabilityKeys.CRISIS_MANAGEMENT, UnitCapabilityKeys.SCENARIO_CONTROL],
    },
    'chemicky-forenzni-tym': {
      kind: 'TEAM',
      description: 'Chemical analysis and forensic evidence examination',
      capabilities: [UnitCapabilityKeys.CHEMICAL_ANALYSIS, UnitCapabilityKeys.EVIDENCE],
    },
    'zachranna-a-zdravotni-sluzba': {
      kind: 'TEAM',
      description: 'Medical response and operational health support',
      capabilities: [UnitCapabilityKeys.MEDICAL_OPERATIONS],
    },
  } as const;

export const canonicalUnits = [
  ...previewTeams.map(team => ({ ...team, ...unitSpecifications[team.slug] })),
  { slug: 'soudni-senat', name: 'Soudní senát', kind: 'TEAM',
    description: 'Independent judges and judicial case administration for the exercise',
    capabilities: [UnitCapabilityKeys.COURT_PROCEEDINGS] },
];

export const legalRoleTemplates = [
  {
    slug: 'statni-zastupce', name: 'Státní zástupce / Prosecutor',
    description: 'Prepares prosecution, files charges and motions, requests case evidence and expert reports. Cannot issue judicial decisions.',
    permissions: [
      Permissions.EVENT_READ, Permissions.COURT_READ, Permissions.COURT_CREATE,
      Permissions.COURT_CHARGE_MANAGE, Permissions.COURT_FILING_READ, Permissions.COURT_FILING_CREATE,
      Permissions.COURT_EXHIBIT_READ, Permissions.COURT_EXHIBIT_SUBMIT,
      Permissions.COURT_DECISION_READ, Permissions.COURT_REQUEST_READ, Permissions.COURT_REQUEST_CREATE,
      Permissions.DOCUMENT_READ, Permissions.DOCUMENT_CREATE, Permissions.CASE_READ,
      Permissions.EVIDENCE_READ, Permissions.REGISTRY_READ,
    ].map(key => ({ key, scope: PermissionScopes.EVENT })),
  },
  {
    slug: 'soudce', name: 'Soudce / Soudkyně / Judge',
    description: 'Independently schedules hearings, decides on exhibits and issues court decisions. Cannot write prosecution charges.',
    permissions: [
      Permissions.EVENT_READ, Permissions.COURT_READ, Permissions.COURT_UPDATE,
      Permissions.COURT_EXHIBIT_READ, Permissions.COURT_EXHIBIT_DECIDE,
      Permissions.COURT_HEARING_MANAGE, Permissions.COURT_FILING_READ,
      Permissions.COURT_DECISION_READ, Permissions.COURT_DECISION_CREATE,
      Permissions.COURT_REQUEST_READ, Permissions.COURT_REQUEST_CREATE, Permissions.COURT_REQUEST_RESPOND,
      Permissions.DOCUMENT_READ, Permissions.CASE_READ, Permissions.EVIDENCE_READ,
      Permissions.REGISTRY_READ,
    ].map(key => ({ key, scope: PermissionScopes.EVENT })),
  },
  {
    slug: 'legal-expert-liaison', name: 'Znalec / spojka pro podklady soudu',
    description: 'Receives and fulfills formal requests for permitted evidence, documents, reports and expert opinions.',
    permissions: [
      Permissions.EVENT_READ, Permissions.COURT_READ,
      Permissions.COURT_REQUEST_READ, Permissions.COURT_REQUEST_RESPOND,
      Permissions.DOCUMENT_READ, Permissions.EVIDENCE_READ, Permissions.REGISTRY_READ,
    ].map(key => ({ key, scope: PermissionScopes.EVENT })),
  },
];

// Explicit, additive role definitions. A unit capability or name never grants access.
// Ordinary staff and supervisors are separate. Existing roles are not silently rewritten.
const grants=(scope:PermissionScope,...keys:PermissionKey[])=>keys.map(key=>({key,scope}));
const eventGrants=(...keys:PermissionKey[])=>grants(PermissionScopes.EVENT,...keys);
const unitGrants=(...keys:PermissionKey[])=>grants(PermissionScopes.UNIT,...keys);
const ownGrants=(...keys:PermissionKey[])=>grants(PermissionScopes.OWN,...keys);
const assignedGrants=(...keys:PermissionKey[])=>grants(PermissionScopes.ASSIGNED,...keys);
const P=Permissions;
const commonStaff=[
  ...eventGrants(P.EVENT_READ,P.UNIT_READ,P.TIMELINE_READ,P.BRIEFING_READ,P.BRIEFING_ACKNOWLEDGE),
  ...assignedGrants(P.TASK_READ,P.TASK_ACKNOWLEDGE,P.TASK_WORK,P.TASK_COMPLETE),
];
const requestGrants=[...eventGrants(P.LAB_REQUEST,P.FORENSICS_REQUEST),...ownGrants(P.LAB_READ,P.FORENSICS_READ)];
const documentGrants=[...eventGrants(P.DOCUMENT_READ,P.DOCUMENT_CREATE),...ownGrants(P.DOCUMENT_UPDATE,P.DOCUMENT_VERSION)];
const labStaff=[
  ...commonStaff,...documentGrants,...unitGrants(P.LAB_READ),
  ...assignedGrants(P.LAB_READ,P.LAB_ACCEPT,P.LAB_WORK,P.LAB_COMPLETE,P.EVIDENCE_READ),
];
const digitalStaff=[
  ...commonStaff,...documentGrants,...unitGrants(P.FORENSICS_READ),
  ...assignedGrants(P.FORENSICS_READ,P.FORENSICS_ACCEPT,P.FORENSICS_WORK,P.FORENSICS_COMPLETE,P.EVIDENCE_READ,P.REGISTRY_READ),
  ...eventGrants(P.INDICATOR_READ,P.INDICATOR_CREATE),
];
export const canonicalTeamRoleProfiles=[
  {slug:'team-bps-operator',name:'BPS – vyšetřovatel',description:'Evidence collection, cases and external analysis requests',permissions:[
    ...commonStaff,...documentGrants,...requestGrants,
    ...eventGrants(P.INCIDENT_READ,P.INCIDENT_CREATE,P.CASE_READ,P.CASE_CREATE,P.EVIDENCE_READ,P.EVIDENCE_CREATE,P.REGISTRY_READ),
    ...ownGrants(P.INCIDENT_UPDATE,P.CASE_UPDATE,P.EVIDENCE_UPDATE,P.EVIDENCE_TRANSFER),
    ...unitGrants(P.INCIDENT_UPDATE,P.CASE_UPDATE,P.EVIDENCE_UPDATE,P.EVIDENCE_TRANSFER),
  ]},
  {slug:'team-lavender-operator',name:'Laboratoř levandulového oleje – analytik',description:'Assigned laboratory sample processing',permissions:labStaff},
  {slug:'team-cyber-forensic-operator',name:'Kybernetický forenzní tým – analytik',description:'Assigned digital analysis and own unit queue',permissions:digitalStaff},
  {slug:'team-intelligence-operator',name:'Juniorská zpravodajská služba – analytik',description:'Intelligence synthesis and operational reporting',permissions:[
    ...commonStaff,...documentGrants,...eventGrants(P.INTELLIGENCE_USE,P.INCIDENT_READ,P.CASE_READ,P.REGISTRY_READ),
  ]},
  {slug:'team-crisis-operator',name:'Juniorský krizový štáb – člen',description:'Operational picture and coordination, no DEFCON change',permissions:[
    ...commonStaff,...documentGrants,...eventGrants(P.COMMAND_READ,P.INCIDENT_READ,P.TASK_CREATE,P.TASK_READ,P.TASK_ASSIGN),
  ]},
  {slug:'team-chemical-forensic-operator',name:'Chemický forenzní tým – analytik',description:'Assigned physical evidence and laboratory processing',permissions:labStaff},
  {slug:'team-medical-operator',name:'Záchranná a zdravotní služba – zdravotník',description:'Medical work in own active unit',permissions:[...commonStaff,...medicalResponderPermissions]},
  {slug:'team-court-support',name:'Soudní senát – podpora',description:'Court records and filings, no judicial decisions',permissions:[
    ...commonStaff,...documentGrants,...eventGrants(P.COURT_READ,P.COURT_FILING_READ,P.COURT_EXHIBIT_READ,P.COURT_DECISION_READ,P.COURT_REQUEST_READ),
  ]},
  {slug:'team-laboratory-lead',name:'Laboratoř – vedoucí',description:'Unit coordination and approval, no exercise correction',permissions:[
    ...labStaff,...unitGrants(P.LAB_REASSIGN,P.LAB_APPROVE),
  ]},
  {slug:'team-digital-forensic-lead',name:'Digitální forenzika – vedoucí',description:'Unit coordination and approval',permissions:[
    ...digitalStaff,...unitGrants(P.FORENSICS_REASSIGN,P.FORENSICS_APPROVE),
  ]},
];
const eventRoleTemplates = [
  { slug: 'team-member', name: 'Team Member', description: 'Least-privilege event access for operational team members', permissions: teamMemberPermissions },
  {
    slug: 'exercise-organizer', name: 'Exercise Organizer',
    description: 'Exercise-scoped coordination, support and corrective authority; no platform administration', permissions: exerciseOrganizerPermissions,
  },
  { slug: 'exercise-command', name: 'Krizový štáb', description: 'Řízení připravenosti, úkolů a situačních zpráv cvičení', permissions: crisisCommandPermissions },
  { slug: 'medical-responder', name: 'Zdravotník / Medical Responder',
    description: 'Receives exercise casualties and records triage, treatment and transfers only within assigned medical unit',
    permissions: medicalResponderPermissions },
  ...laboratoryRoles,
  { slug:'forensic-worker',name:'Digitální forenzní analytik',description:'Processes assigned digital forensic analyses',permissions:[Permissions.FORENSICS_READ,Permissions.FORENSICS_ACCEPT,Permissions.FORENSICS_WORK,Permissions.FORENSICS_COMPLETE].map(key=>({key,scope:PermissionScopes.ASSIGNED})) },
  { slug:'forensic-coordinator',name:'Vedoucí digitální forenziky',description:'Coordinates digital forensic work in the assigned unit',permissions:[Permissions.FORENSICS_READ,Permissions.FORENSICS_REASSIGN].map(key=>({key,scope:PermissionScopes.UNIT})) },
  { slug:'forensic-requester',name:'Žadatel o digitální forenzní analýzu',description:'Requests analyses and follows own results',permissions:[{key:Permissions.FORENSICS_REQUEST,scope:PermissionScopes.EVENT},{key:Permissions.FORENSICS_READ,scope:PermissionScopes.OWN}] },
  ...legalRoleTemplates,
  ...canonicalTeamRoleProfiles,
];

/** Builds missing templates in an existing exercise; operators retain ownership of existing records. */
export async function addMissingEventTemplates(tx: Transaction, eventId: string, onUnitCreated?: (unitId: string) => Promise<void>) {
  let rolesCreated = 0;
  let unitsCreated = 0;
  for (const { slug, name, description, permissions } of eventRoleTemplates) {
    // The manual role creator holds the same lock for this slug.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`event-role:${eventId}:${slug}`}))`);
    const [existing] = await tx.select({ id: roles.id }).from(roles)
      .where(and(eq(roles.eventId, eventId), eq(roles.slug, slug))).limit(1);
    if (existing) continue;
    const [role] = await tx.insert(roles).values({ eventId, slug, name, description }).returning({ id: roles.id });
    await tx.insert(rolePermissions).values(permissions.map(({ key, scope }) => ({ roleId: role!.id, permissionKey: key, scope })));
    rolesCreated++;
  }

  for (const { slug, name, kind, description, capabilities } of canonicalUnits) {
    const [unit] = await tx.insert(organizationalUnits).values({ eventId, slug, name, kind, description })
      .onConflictDoNothing({ target: [organizationalUnits.eventId, organizationalUnits.slug] }).returning({ id: organizationalUnits.id });
    if (!unit) continue;
    await tx.insert(unitCapabilities).values(capabilities.map(capabilityKey => ({ unitId: unit.id, capabilityKey })));
    if (onUnitCreated) await onUnitCreated(unit.id);
    unitsCreated++;
  }
  return { eventId, rolesCreated, unitsCreated };
}
