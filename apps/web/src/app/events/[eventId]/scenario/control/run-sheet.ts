import type { ScenarioInjectResponse } from '@cyris/contracts';

export type Translate = (czech: string, english: string) => string;
export const inCzech: Translate = (czech) => czech;
export const inEnglish: Translate = (_, english) => english;

const terms: Record<string, [string, string]> = {
  DRAFT: ['Koncept', 'Draft'], READY: ['Připraveno', 'Ready'], RELEASED: ['Vydáno', 'Released'],
  BLOCKED: ['Čeká na splnění podmínek', 'Waiting on requirements'], SCHEDULED: ['Naplánováno', 'Scheduled'],
  CANCELLED: ['Zrušeno', 'Cancelled'], PLANNED: ['Plánovaná', 'Planned'], ACTIVE: ['Probíhá', 'Active'],
  COMPLETED: ['Dokončeno', 'Completed'], LOW: ['Nízká', 'Low'], NORMAL: ['Běžná', 'Normal'],
  HIGH: ['Vysoká', 'High'], CRITICAL: ['Kritická', 'Critical'], MANUAL: ['Ručně', 'Manual'],
  SCHEDULED_TIME: ['Ve scénářovém čase', 'At a scenario time'], CONDITION: ['Po splnění podmínky', 'On condition'],
  EXTERNAL: ['Vnější podnět', 'External trigger'], MANUAL_CONFIRMATION: ['Potvrdí režie', 'Controller confirms'],
  AUTO_RELEASE: ['Automaticky', 'Automatic release'], ALL: ['Všechny', 'All'], ANY: ['Alespoň jedna', 'Any'],
  EVENT: ['Celé cvičení', 'Whole exercise'], UNIT: ['Jednotka', 'Unit'], USER: ['Účastník', 'Participant'],
  INJECT_RELEASED: ['Vydání jiného vstupu', 'Another inject released'], ACTIVITY_OCCURRED: ['Událost na časové ose', 'Timeline activity'],
  CASE_STATUS: ['Stav případu', 'Case status'], INCIDENT_STATUS: ['Stav incidentu', 'Incident status'],
  EVIDENCE_STATUS: ['Stav důkazu', 'Evidence status'], LAB_STATUS: ['Stav rozboru', 'Lab status'],
  TASK_STATUS: ['Stav úkolu', 'Task status'], RECOVERY_OBJECTIVE_STATUS: ['Stav cíle obnovy', 'Recovery objective status'],
  OPEN: ['Otevřeno', 'Open'], ACKNOWLEDGED: ['Převzato', 'Acknowledged'], IN_PROGRESS: ['Probíhá', 'In progress'],
  PUBLISHED: ['Zveřejněno', 'Published'], APPROVED: ['Schváleno', 'Approved'], REJECTED: ['Zamítnuto', 'Rejected'],
  RESTORED: ['Obnoveno', 'Restored'], DELIVER_BRIEFING: ['Doručit briefing', 'Deliver briefing'],
  CREATE_INCIDENT: ['Vytvořit incident', 'Create incident'], GRANT_RESOURCE_ACCESS: ['Přidělit přístup k záznamu', 'Grant access to a record'],
  CHANGE_RESOURCE_VISIBILITY: ['Změnit viditelnost záznamu', 'Change record visibility'],
};

export function term(value: string, tr: Translate): string {
  const labels = terms[value];
  return labels ? tr(...labels) : value;
}

export function audience(inject: ScenarioInjectResponse, tr: Translate) {
  if(inject.status==='DRAFT'&&!inject.targets.length)return tr('Příjemci nejsou určeni','Audience not selected');
  return inject.targets.length ? inject.targets.map(target => {
    if (target.targetType === 'UNIT') return target.unitName || target.targetUnitId || term('UNIT', tr);
    if (target.targetType === 'USER') return target.userFullName || target.targetUserId || term('USER', tr);
    return term('EVENT', tr);
  }).join(', ') : term('EVENT', tr);
}

export function canReleaseNow(inject: ScenarioInjectResponse) {
  return inject.status === 'READY' || (inject.status === 'SCHEDULED' && inject.isDue === true);
}

// Native date/time inputs use the operator's browser time zone.
export function localInput(iso?: string | null) {
  if (!iso) return '';
  const instant = new Date(iso);
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
