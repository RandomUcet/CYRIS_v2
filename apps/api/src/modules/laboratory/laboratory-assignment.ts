export interface WorkloadCandidate {
  userId: string;
  workload: number;
}

export function selectLowestWorkloadCandidate(
  candidates: WorkloadCandidate[]
): WorkloadCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const workloadDifference = a.workload - b.workload;
    return workloadDifference !== 0
      ? workloadDifference
      : a.userId.localeCompare(b.userId);
  })[0] ?? null;
}
