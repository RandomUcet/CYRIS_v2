import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { isServiceModule, type RestrictedServiceMode, type ServiceModule } from '@cyris/contracts';
import type { ExerciseDisruption } from '@cyris/db';

export type ServiceOperation = 'read' | 'write';

export function assertSupportedDisruption(module: string, mode: string): void {
  if (!isServiceModule(module) || (mode !== 'UNAVAILABLE' && mode !== 'READ_ONLY')) {
    throw new BadRequestException('Select an available module and restriction mode');
  }
}

export function isActiveDisruption(row: ExerciseDisruption, now = new Date()): boolean {
  return !row.restoredAt && row.startsAt <= now && (!row.expiresAt || row.expiresAt > now);
}

/** Only mode and module leave the recipient-scoped, currently active query. */
export function resolveModuleImpacts(
  rows: ReadonlyArray<{ module: string; mode: string }>,
): ReadonlyMap<ServiceModule, RestrictedServiceMode> {
  const impacts = new Map<ServiceModule, RestrictedServiceMode>();
  for (const { module, mode } of rows) {
    if (isServiceModule(module) && (mode === 'READ_ONLY' || mode === 'UNAVAILABLE') &&
        impacts.get(module) !== 'UNAVAILABLE') {
      impacts.set(module, mode);
    }
  }
  return impacts;
}

export function assertServiceOperation(impact: RestrictedServiceMode | undefined, operation: ServiceOperation): void {
  if (impact === 'UNAVAILABLE') {
    throw new ServiceUnavailableException({ code: 'SERVICE_UNAVAILABLE', message: 'This service is temporarily unavailable.' });
  }
  if (impact === 'READ_ONLY' && operation === 'write') {
    throw new ForbiddenException({ code: 'SERVICE_READ_ONLY', message: 'This service is currently read-only.' });
  }
}

export function assertRevision(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new ConflictException(`Revision conflict: expected ${expected}, current ${actual}`);
  }
}
