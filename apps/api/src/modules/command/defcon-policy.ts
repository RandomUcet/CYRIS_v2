import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CommandDefconLevel } from '@cyris/contracts';

export function validateDefconLevel(level: number): asserts level is CommandDefconLevel {
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new BadRequestException('DEFCON level must be an integer from 1 to 5');
  }
}

export function assertExpectedRevision(expected: number, current: number): void {
  if (expected !== current) {
    throw new ConflictException(`DEFCON revision conflict: expected ${expected}, current ${current}`);
  }
}

export function isConcurrentInitializationError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
  );
}
