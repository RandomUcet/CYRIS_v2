/**
 * ==============================================================================
 * CYRIS v2 — Permission Catalog & Scopes
 * ==============================================================================
 * Permissions are atomic string tokens.
 * Roles are simply named bundles of permissions.
 * Scopes define the operational boundary where a permission applies.
 */

export const PermissionScopes = {
  PLATFORM: 'PLATFORM',
  EVENT: 'EVENT',
  UNIT: 'UNIT',
  OWN: 'OWN',
  ASSIGNED: 'ASSIGNED',
} as const;

export type PermissionScope = (typeof PermissionScopes)[keyof typeof PermissionScopes];

export const Permissions = {
  // Platform administration
  PLATFORM_MANAGE: 'platform.manage',

  // Events
  EVENT_READ: 'event.read',
  EVENT_CREATE: 'event.create',
  EVENT_UPDATE: 'event.update',
  EVENT_ARCHIVE: 'event.archive',

  // Event Memberships
  MEMBERSHIP_READ: 'membership.read',
  MEMBERSHIP_MANAGE: 'membership.manage',

  // Organizational Units
  UNIT_READ: 'unit.read',
  UNIT_MANAGE: 'unit.manage',

  // Roles & Permissions
  ROLE_READ: 'role.read',
  ROLE_MANAGE: 'role.manage',

  // Audit
  AUDIT_READ: 'audit.read',

  // Timeline
  TIMELINE_READ: 'timeline.read',

  // Scenario Registry
  REGISTRY_READ: 'registry.read',
  REGISTRY_CREATE: 'registry.create',
  REGISTRY_UPDATE: 'registry.update',
  REGISTRY_RELATIONSHIP_MANAGE: 'registry.relationship.manage',

  // Incidents
  INCIDENT_READ: 'incident.read',
  INCIDENT_CREATE: 'incident.create',
  INCIDENT_UPDATE: 'incident.update',
  INCIDENT_ASSIGN: 'incident.assign',

  // Cases / Investigations
  CASE_READ: 'case.read',
  CASE_CREATE: 'case.create',
  CASE_UPDATE: 'case.update',
  CASE_ASSIGN: 'case.assign',
  CASE_CLOSE: 'case.close',

  // Evidence
  EVIDENCE_READ: 'evidence.read',
  EVIDENCE_CREATE: 'evidence.create',
  EVIDENCE_UPDATE: 'evidence.update',
  EVIDENCE_TRANSFER: 'evidence.transfer',

  // Laboratory Analysis
  LAB_READ: 'lab.read',
  LAB_REQUEST: 'lab.request',
  LAB_ACCEPT: 'lab.accept',
  LAB_WORK: 'lab.work',
  LAB_COMPLETE: 'lab.complete',
  LAB_APPROVE: 'lab.approve',

  // Integrations & Intelligence
  INTEGRATION_MANAGE: 'integration.manage',
  INTELLIGENCE_USE: 'intelligence.use',

  // Scenario Control & Exercise Orchestration
  SCENARIO_READ: 'scenario.read',
  SCENARIO_MANAGE: 'scenario.manage',
  SCENARIO_RELEASE: 'scenario.release',
  SCENARIO_SECRET_READ: 'scenario.secret.read',
  SCENARIO_OVERRIDE: 'scenario.override',

  // Participant Briefings
  BRIEFING_READ: 'briefing.read',
  BRIEFING_ACKNOWLEDGE: 'briefing.acknowledge',

  // Documents & Object Storage
  DOCUMENT_READ: 'document.read',
  DOCUMENT_CREATE: 'document.create',
  DOCUMENT_UPDATE: 'document.update',
  DOCUMENT_VERSION: 'document.version',
  DOCUMENT_DELETE: 'document.delete',

  // Digital Forensics & Technical Analysis
  FORENSICS_READ: 'forensics.read',
  FORENSICS_REQUEST: 'forensics.request',
  FORENSICS_ACCEPT: 'forensics.accept',
  FORENSICS_WORK: 'forensics.work',
  FORENSICS_COMPLETE: 'forensics.complete',
  FORENSICS_APPROVE: 'forensics.approve',

  // Technical Indicators
  INDICATOR_READ: 'indicator.read',
  INDICATOR_CREATE: 'indicator.create',
  INDICATOR_UPDATE: 'indicator.update',

  // Prosecution, Defence & Court
  COURT_READ: 'court.read',
  COURT_CREATE: 'court.create',
  COURT_UPDATE: 'court.update',
  COURT_ASSIGN: 'court.assign',
  COURT_CHARGE_MANAGE: 'court.charge.manage',
  COURT_EXHIBIT_READ: 'court.exhibit.read',
  COURT_EXHIBIT_SUBMIT: 'court.exhibit.submit',
  COURT_EXHIBIT_DECIDE: 'court.exhibit.decide',
  COURT_HEARING_MANAGE: 'court.hearing.manage',
  COURT_FILING_READ: 'court.filing.read',
  COURT_FILING_CREATE: 'court.filing.create',
  COURT_DECISION_CREATE: 'court.decision.create',
  COURT_DECISION_READ: 'court.decision.read',

  // Operational Tasking
  TASK_READ: 'task.read',
  TASK_CREATE: 'task.create',
  TASK_UPDATE: 'task.update',
  TASK_ASSIGN: 'task.assign',
  TASK_ACKNOWLEDGE: 'task.acknowledge',
  TASK_WORK: 'task.work',
  TASK_COMPLETE: 'task.complete',
  TASK_CANCEL: 'task.cancel',

  // Medical Response & Operations
  MEDICAL_READ: 'medical.read',
  MEDICAL_CREATE: 'medical.create',
  MEDICAL_UPDATE: 'medical.update',
  MEDICAL_TRIAGE: 'medical.triage',
  MEDICAL_OBSERVE: 'medical.observe',
  MEDICAL_INTERVENE: 'medical.intervene',
  MEDICAL_TRANSFER: 'medical.transfer',
  MEDICAL_CLOSE: 'medical.close',

  // Observer & Evaluation
  EVALUATION_READ: 'evaluation.read',
  EVALUATION_MANAGE: 'evaluation.manage',
  EVALUATION_OBSERVE: 'evaluation.observe',
  EVALUATION_SCORE: 'evaluation.score',
  EVALUATION_LOCK: 'evaluation.lock',
  EVALUATION_PUBLISH: 'evaluation.publish',

  // Notifications
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_MANAGE: 'notification.manage',

  // User Preferences
  PREFERENCE_READ: 'preference.read',
  PREFERENCE_UPDATE: 'preference.update',

  // Identity & Integration Management
  IDENTITY_MANAGE: 'identity.manage',
} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

/**
 * Evaluates whether a granted role permission scope satisfies a required operational scope.
 *
 * CRITICAL ARCHITECTURAL RULE:
 * Scopes in CYRIS are NOT a single total order (PLATFORM > EVENT > UNIT > ASSIGNED > OWN is INVALID).
 *
 * Correct Scope Model:
 * - PLATFORM: Covers platform context and can satisfy general event/unit contexts where appropriate.
 * - EVENT: Applies within one bounded event and can satisfy general unit contexts.
 * - UNIT: Applies within a specific organizational unit (and its sub-units).
 * - OWN: Contextual predicate — applies only when the authenticated user is the author/owner.
 * - ASSIGNED: Contextual predicate — applies only when the authenticated user is explicitly assigned.
 *
 * OWN and ASSIGNED are contextual predicates, NOT lower-ranking organizational scopes.
 * They are not interchangeable, neither inherently satisfies the other, and organizational scopes
 * (like UNIT) do not satisfy them without context evaluation.
 */
export function isScopeSufficient(
  grantedScope: PermissionScope,
  requiredScope: PermissionScope
): boolean {
  if (grantedScope === requiredScope) {
    return true;
  }

  // PLATFORM scope can satisfy general EVENT and UNIT contexts
  if (grantedScope === PermissionScopes.PLATFORM) {
    return (
      requiredScope === PermissionScopes.EVENT ||
      requiredScope === PermissionScopes.UNIT
    );
  }

  // EVENT scope can satisfy general UNIT context within the event
  if (grantedScope === PermissionScopes.EVENT) {
    return requiredScope === PermissionScopes.UNIT;
  }

  // UNIT does NOT satisfy OWN or ASSIGNED predicates
  // OWN and ASSIGNED are non-interchangeable contextual predicates
  return false;
}

