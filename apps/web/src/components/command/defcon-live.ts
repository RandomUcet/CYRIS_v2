import type { CommandDefconSnapshot } from '@cyris/contracts';

export function acceptDefconSnapshot(
  previous: CommandDefconSnapshot | null,
  next: CommandDefconSnapshot,
  eventId: string,
): CommandDefconSnapshot | null {
  if (next.eventId !== eventId) return previous;
  if (previous && next.revision < previous.revision) return previous;
  return next;
}
