import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ExerciseDisruption } from '@cyris/db';

export const ENFORCED_DISRUPTION_MODULE = 'tasks' as const;
export const ENFORCED_DISRUPTION_MODES = ['UNAVAILABLE', 'READ_ONLY', 'DEGRADED'] as const;

export function assertSupportedDisruption(module: string, mode: string): void {
  if (module !== ENFORCED_DISRUPTION_MODULE || !ENFORCED_DISRUPTION_MODES.includes(mode as typeof ENFORCED_DISRUPTION_MODES[number])) {
    throw new ForbiddenException('Only supported tasks disruption modes are allowed');
  }
}

export function isTargetApplicable(row: ExerciseDisruption, userId: string, unitId?: string | null): boolean {
  return row.targetType === 'EVENT' ||
    (row.targetType === 'USER' && row.targetId === userId) ||
    (row.targetType === 'UNIT' && Boolean(unitId) && row.targetId === unitId);
}

export function isActiveDisruption(row: ExerciseDisruption, now = new Date()): boolean {
  return !row.restoredAt && row.startsAt <= now && (!row.expiresAt || row.expiresAt > now);
}

export function resolveDisruption(
  rows: ExerciseDisruption[],
  now: Date,
  userId: string,
  unitId?: string | null,
): ExerciseDisruption | null {
  const applicable = rows
    .filter((row) => isActiveDisruption(row, now))
    .filter((row) => isTargetApplicable(row, userId, unitId))
    .sort((left, right) => {
      const restriction = { UNAVAILABLE: 3, READ_ONLY: 2, DEGRADED: 1 } as const;
      const specificity = { USER: 3, UNIT: 2, EVENT: 1 } as const;
      return restriction[right.mode as keyof typeof restriction] - restriction[left.mode as keyof typeof restriction]
        || specificity[right.targetType as keyof typeof specificity] - specificity[left.targetType as keyof typeof specificity]
        || right.startsAt.getTime() - left.startsAt.getTime()
        || right.id.localeCompare(left.id);
    });
  return applicable[0] ?? null;
}

export function assertRevision(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new ConflictException(`Disruption revision conflict: expected ${expected}, current ${actual}`);
  }
}

export function assertParticipantWriteAllowed(disruption: ExerciseDisruption | null): void {
  if (disruption?.mode === 'UNAVAILABLE' || disruption?.mode === 'READ_ONLY') {
    throw new ForbiddenException(`Module is simulated as ${disruption.mode.toLowerCase()}`);
  }
}
