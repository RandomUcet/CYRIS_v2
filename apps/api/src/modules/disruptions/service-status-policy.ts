import { type ServiceModule, type ServiceStatusItem, type ServiceStatusResponse } from '@cyris/contracts';
import { Permissions, type PermissionKey } from '@cyris/shared';

/** A personal status item is disclosed only to members who can use that service. */
export const serviceReadPermissions: Record<ServiceModule, readonly PermissionKey[]> = {
  tasks: [Permissions.TASK_READ],
  cases: [Permissions.CASE_READ],
  incidents: [Permissions.INCIDENT_READ],
  registry: [Permissions.REGISTRY_READ],
  relationships: [Permissions.REGISTRY_READ],
  evidence: [Permissions.EVIDENCE_READ],
  documents: [Permissions.DOCUMENT_READ],
  lab: [Permissions.LAB_READ],
  forensics: [Permissions.FORENSICS_READ, Permissions.INDICATOR_READ],
  court: [Permissions.COURT_READ],
  medical: [Permissions.MEDICAL_READ],
  briefings: [Permissions.BRIEFING_READ],
  timeline: [Permissions.TIMELINE_READ],
  intelligence: [Permissions.INTELLIGENCE_USE],
  evaluation: [Permissions.EVALUATION_READ],
  command: [Permissions.COMMAND_READ],
  scenario: [Permissions.SCENARIO_READ],
};

export function summarizeServiceStatus(items: ServiceStatusItem[]): ServiceStatusResponse['current'] {
  return {
    impact: items.some(({ impact }) => impact === 'UNAVAILABLE')
      ? 'UNAVAILABLE' : items.length ? 'READ_ONLY' : 'NONE',
    activeCount: items.length,
  };
}
