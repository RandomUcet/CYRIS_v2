import type { ServiceModule } from '@cyris/contracts';

const resourceModules: Record<string, ServiceModule> = {
  operational_task: 'tasks', task: 'tasks', case: 'cases', incident: 'incidents',
  person: 'registry', organisation: 'registry', location: 'registry', vehicle: 'registry',
  device: 'registry', weapon: 'registry', relationship: 'relationships', evidence: 'evidence',
  document: 'documents', lab_analysis: 'lab', forensic_analysis: 'forensics',
  forensic_acquisition: 'forensics', forensic_finding: 'forensics', technical_indicator: 'forensics',
  court_case: 'court', court_case_party: 'court', court_decision: 'court', court_exhibit: 'court',
  court_filing: 'court', court_hearing: 'court', charge: 'court', medical_encounter: 'medical',
  medical_intervention: 'medical', medical_observation: 'medical', briefing_delivery: 'briefings',
  evaluation_criterion: 'evaluation', evaluation_objective: 'evaluation',
  evaluation_observation: 'evaluation', evaluation_session: 'evaluation', scenario_phase: 'scenario',
  scenario_clock: 'scenario', scenario_inject: 'scenario', scenario_data_batch: 'scenario',
};
const domainModules: Record<string, ServiceModule> = {
  task: 'tasks', case: 'cases', incident: 'incidents', registry: 'registry', relationship: 'relationships',
  evidence: 'evidence', document: 'documents', lab: 'lab', forensic: 'forensics', forensics: 'forensics',
  indicator: 'forensics', court: 'court', medical: 'medical', briefing: 'briefings', timeline: 'timeline',
  intelligence: 'intelligence', evaluation: 'evaluation', command: 'command', scenario: 'scenario',
};

export const privateControlTypes = ['exercise_disruption', 'recovery_objective', 'recovery_artifact', 'recovery_report'];

export function serviceModuleForResourceType(resourceType: string): ServiceModule | undefined {
  return Object.hasOwn(resourceModules, resourceType) ? resourceModules[resourceType] : undefined;
}

export function serviceModuleForAction(action: string): ServiceModule | undefined {
  if (action.startsWith('command.defcon')) return undefined;
  const prefix = action.split('.')[0]!;
  return Object.hasOwn(domainModules, prefix) ? domainModules[prefix] : undefined;
}

export function resourceTypesForModule(module: ServiceModule): string[] {
  return Object.keys(resourceModules).filter((type) => resourceModules[type] === module);
}
