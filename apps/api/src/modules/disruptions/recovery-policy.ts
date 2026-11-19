export type RecoveryObjectiveState = 'DRAFT' | 'PUBLISHED' | 'APPROVED' | 'REJECTED' | 'RESTORED';

export function assertObjectiveTransition(current: RecoveryObjectiveState, next: RecoveryObjectiveState): void {
  const allowed: Record<RecoveryObjectiveState, RecoveryObjectiveState[]> = {
    DRAFT: ['PUBLISHED'],
    PUBLISHED: ['APPROVED', 'REJECTED'],
    APPROVED: ['RESTORED'],
    REJECTED: [],
    RESTORED: [],
  };
  if (!allowed[current].includes(next)) throw new Error(`Invalid recovery objective transition ${current} -> ${next}`);
}

export function assertReportAllowed(status: RecoveryObjectiveState, disruptionActive: boolean): void {
  if (status !== 'PUBLISHED' || !disruptionActive) throw new Error('Recovery report is not available');
}
