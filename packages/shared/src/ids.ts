import { uuidv7 } from 'uuidv7';

/**
 * Generates a standard, time-sortable UUIDv7 for primary keys.
 */
export function generateId(): string {
  return uuidv7();
}
