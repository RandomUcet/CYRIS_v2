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

export function assertApprovalHasReport(reportExists: boolean): void {
  if (!reportExists) throw new Error('A participant recovery report is required before approval');
}

export function assertPublishedAudienceAccess(published: boolean, audienceMatches: boolean): void {
  if (!published || !audienceMatches) throw new Error('Recovery artifact is not available in this event scope');
}

export function assertNoDuplicateReport(existing: boolean): void {
  if (existing) throw new Error('A recovery report was already submitted for this objective');
}

export function assertLinkedDisruptionActive(active: boolean): void {
  if (!active) throw new Error('The linked disruption is expired, restored or unavailable');
}
