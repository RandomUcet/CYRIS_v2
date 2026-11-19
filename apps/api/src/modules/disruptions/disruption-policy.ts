import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ExerciseDisruption } from '@cyris/db';

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
    .filter((row) =>
      row.targetType === 'EVENT' ||
      (row.targetType === 'USER' && row.targetId === userId) ||
      (row.targetType === 'UNIT' && Boolean(unitId) && row.targetId === unitId)
    )
    .sort((left, right) => {
      const specificity = { USER: 3, UNIT: 2, EVENT: 1 } as const;
      return specificity[right.targetType as keyof typeof specificity] - specificity[left.targetType as keyof typeof specificity]
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
