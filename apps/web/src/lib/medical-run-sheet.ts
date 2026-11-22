import type { MedicalEncounterItem } from '@cyris/contracts';

export type MedicalRunSheetView = 'active' | 'triage' | 'transfers' | 'all';
export interface MedicalRunSheetFilters {
  view: MedicalRunSheetView;
  search?: string;
  triage?: string;
}

export function parseMedicalRunSheetView(value: string | null): MedicalRunSheetView {
  return value === 'triage' || value === 'transfers' || value === 'all' ? value : 'active';
}

/** One consistent filter for the live workspace and the printable run sheet. */
export function filterMedicalRunSheet(
  encounters: readonly MedicalEncounterItem[],
  filters: MedicalRunSheetFilters,
): MedicalEncounterItem[] {
  const search = (filters.search ?? '').trim().toLocaleLowerCase();
  return encounters.filter((record) => {
    if (search && ![
      record.medicalNumber, record.personDisplayName, record.chiefComplaint, record.assignedUnitName,
    ].some((field) => field?.toLocaleLowerCase().includes(search))) return false;
    if (filters.triage && record.triageCategory !== filters.triage) return false;
    if (filters.view === 'active') {
      return ['RECEIVED', 'TRIAGED', 'UNDER_CARE', 'STABILIZED'].includes(record.status);
    }
    if (filters.view === 'triage') return record.status === 'TRIAGED' || record.triageCategory === 'IMMEDIATE';
    if (filters.view === 'transfers') return record.status === 'TRANSFERRED' || Boolean(record.transferredAt);
    return true;
  });
}
