import { z } from 'zod';

/**
 * CYRIS v2 - Operational Capability Catalog
 * Capabilities define operational functionality/workspace relevance for organizational units.
 * NOTE: Capabilities do NOT grant permissions. Backend authorization remains authoritative.
 */
export const UnitCapabilityKeys = {
  INVESTIGATION: 'investigation',
  INCIDENT_OPERATIONS: 'incident_operations',
  EVIDENCE: 'evidence',
  CHEMICAL_ANALYSIS: 'chemical_analysis',
  DIGITAL_FORENSICS: 'digital_forensics',
  TECHNICAL_OPERATIONS: 'technical_operations',
  CRISIS_MANAGEMENT: 'crisis_management',
  TACTICAL_OPERATIONS: 'tactical_operations',
  MEDICAL_OPERATIONS: 'medical_operations',
  PROSECUTION: 'prosecution',
  DEFENCE: 'defence',
  COURT_PROCEEDINGS: 'court_proceedings',
  SCENARIO_CONTROL: 'scenario_control',
  EVALUATION: 'evaluation',
} as const;

export type UnitCapabilityKey = (typeof UnitCapabilityKeys)[keyof typeof UnitCapabilityKeys];

export interface CapabilityDescriptor {
  key: UnitCapabilityKey | string;
  name: string;
  description: string;
  category: 'INVESTIGATIVE' | 'SPECIALIST_ANALYSIS' | 'OPERATIONS' | 'LEGAL_JUDICIAL' | 'CONTROL_EVALUATION';
}

export const CAPABILITY_CATALOG: CapabilityDescriptor[] = [
  {
    key: UnitCapabilityKeys.INVESTIGATION,
    name: 'Investigation',
    description: 'Case management, suspect inquiry, investigative workflows and intelligence synthesis',
    category: 'INVESTIGATIVE',
  },
  {
    key: UnitCapabilityKeys.INCIDENT_OPERATIONS,
    name: 'Incident Operations',
    description: 'First response, triage, incident management, and operational containment',
    category: 'OPERATIONS',
  },
  {
    key: UnitCapabilityKeys.EVIDENCE,
    name: 'Evidence & Custody',
    description: 'Physical & digital evidence registration, storage management, and chain of custody tracking',
    category: 'INVESTIGATIVE',
  },
  {
    key: UnitCapabilityKeys.CHEMICAL_ANALYSIS,
    name: 'Chemical Analysis',
    description: 'Sample testing, chemical determination, toxicological profiles, and hazardous materials reports',
    category: 'SPECIALIST_ANALYSIS',
  },
  {
    key: UnitCapabilityKeys.DIGITAL_FORENSICS,
    name: 'Digital Forensics',
    description: 'Digital device acquisition, disk extraction, artifact analysis, and mobile forensic work',
    category: 'SPECIALIST_ANALYSIS',
  },
  {
    key: UnitCapabilityKeys.TECHNICAL_OPERATIONS,
    name: 'Technical Operations / JSOC',
    description: 'Telemetry monitoring, network indicators, infrastructure mapping, and technical triage',
    category: 'OPERATIONS',
  },
  {
    key: UnitCapabilityKeys.CRISIS_MANAGEMENT,
    name: 'Command & Crisis Management',
    description: 'Strategic coordination, inter-agency operational picture, and situational leadership',
    category: 'OPERATIONS',
  },
  {
    key: UnitCapabilityKeys.TACTICAL_OPERATIONS,
    name: 'Tactical / Security Operations',
    description: 'Field intervention tracking, physical security perimeters, and tactical deployment',
    category: 'OPERATIONS',
  },
  {
    key: UnitCapabilityKeys.MEDICAL_OPERATIONS,
    name: 'Medical / Hospital / EMS',
    description: 'Casualty management, medical determination, triage, and epidemiological coordination',
    category: 'OPERATIONS',
  },
  {
    key: UnitCapabilityKeys.PROSECUTION,
    name: 'Prosecution',
    description: 'Indictment preparation, evidentiary review, and prosecutorial filings',
    category: 'LEGAL_JUDICIAL',
  },
  {
    key: UnitCapabilityKeys.DEFENCE,
    name: 'Defence',
    description: 'Legal representation, case file discovery review, and defensive submissions',
    category: 'LEGAL_JUDICIAL',
  },
  {
    key: UnitCapabilityKeys.COURT_PROCEEDINGS,
    name: 'Court Proceedings',
    description: 'Judicial docket management, hearings, rulings, and formal legal trial custody',
    category: 'LEGAL_JUDICIAL',
  },
  {
    key: UnitCapabilityKeys.SCENARIO_CONTROL,
    name: 'Scenario Control / EXCON',
    description: 'Exercise orchestration, inject delivery, timeline manipulation, and briefing controls',
    category: 'CONTROL_EVALUATION',
  },
  {
    key: UnitCapabilityKeys.EVALUATION,
    name: 'Evaluation & Observer Oversight',
    description: 'Objective benchmarking, operational assessment, rubrics, and lessons learned',
    category: 'CONTROL_EVALUATION',
  },
];

/* -------------------------------------------------------------------------- */
/* DTO Schemas                                                                */
/* -------------------------------------------------------------------------- */

export const UnitCapabilityResponseSchema = z.object({
  id: z.string().uuid(),
  unitId: z.string().uuid(),
  capabilityKey: z.string(),
  configuration: z.record(z.any()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UnitCapabilityResponse = z.infer<typeof UnitCapabilityResponseSchema>;

export const SetUnitCapabilitiesRequestSchema = z.object({
  capabilityKeys: z.array(z.string().min(1).max(64)),
});
export type SetUnitCapabilitiesRequest = z.infer<typeof SetUnitCapabilitiesRequestSchema>;

export const WorkspaceNavItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  href: z.string(),
  iconKey: z.string().optional(),
  badge: z.string().optional(),
});
export type WorkspaceNavItem = z.infer<typeof WorkspaceNavItemSchema>;

export const WorkspaceNavSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(WorkspaceNavItemSchema),
});
export type WorkspaceNavSection = z.infer<typeof WorkspaceNavSectionSchema>;

export const WorkspaceResolutionResponseSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z.string(),
  unitIds: z.array(z.string().uuid()),
  unitNames: z.array(z.string()),
  capabilities: z.array(z.string()),
  sections: z.array(WorkspaceNavSectionSchema),
});
export type WorkspaceResolutionResponse = z.infer<typeof WorkspaceResolutionResponseSchema>;
