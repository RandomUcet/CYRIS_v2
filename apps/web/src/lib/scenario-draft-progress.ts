type Draft = { id: string; eventId: string; status: string; prepared?: number };
export function draftProgress(prepared: number, expected: number) {
  const safeExpected = Number.isSafeInteger(expected) && expected > 0 ? expected : 0;
  const safePrepared = Number.isSafeInteger(prepared) ? Math.max(0, Math.min(prepared, safeExpected)) : 0;
  return { prepared: safePrepared, expected: safeExpected, percent: safeExpected ? Math.floor(safePrepared / safeExpected * 100) : 0 };
}
export function assertDraftAdvance(previous: Draft, next: Draft): boolean {
  return next.id === previous.id && next.eventId === previous.eventId && next.status === 'DRAFT' &&
    typeof next.prepared === 'number' && Number.isSafeInteger(next.prepared) && next.prepared > (previous.prepared ?? 0);
}
export function formatElapsed(seconds: number): string {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0');
}

/** Detailed requests cannot span record categories; each page holds up to 12. */
export function plannedInferenceCalls(counts: readonly number[], strategy: 'FAST' | 'DETAILED'): number {
  if (!counts.length || counts.some(n => !Number.isSafeInteger(n) || n < 0) || !counts.some(n => n > 0)) return 0;
  return strategy === 'FAST' ? 1 : counts.reduce((sum, n) => sum + Math.ceil(n / 12), 0);
}
