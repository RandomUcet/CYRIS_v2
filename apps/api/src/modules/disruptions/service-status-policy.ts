import type { ServiceImpact, ServiceStatusState } from '@cyris/contracts';

export interface ServiceStatusSource {
  module: string;
  mode: string;
  startsAt: Date;
  expiresAt: Date | null;
  restoredAt: Date | null;
  revision: number;
  reason: string;
}

export function resolveServiceStatusState(source: ServiceStatusSource, now: Date): ServiceStatusState {
  if (source.restoredAt) return 'RESTORED';
  if (source.startsAt.getTime() > now.getTime()) return 'PLANNED';
  if (source.expiresAt && source.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

export function projectServiceImpact(source: ServiceStatusSource | null): ServiceImpact {
  if (!source) return 'NONE';
  if (source.mode === 'READ_ONLY' || source.mode === 'DEGRADED' || source.mode === 'UNAVAILABLE') return source.mode;
  return 'NONE';
}

export function isVisibleToParticipant(
  targetType: string,
  targetId: string | null,
  userId: string,
  unitIds: ReadonlySet<string>,
): boolean {
  return targetType === 'EVENT'
    || (targetType === 'USER' && targetId === userId)
    || (targetType === 'UNIT' && targetId !== null && unitIds.has(targetId));
}

export function summarizeServiceStatus(items: ReadonlyArray<{state:ServiceStatusState;impact:ServiceImpact}>) {
  const active=items.filter(i=>i.state==='ACTIVE');
  const rank:Record<ServiceImpact,number>={NONE:0,DEGRADED:1,READ_ONLY:2,UNAVAILABLE:3};
  const impact=active.reduce<ServiceImpact>((worst,item)=>rank[item.impact]>rank[worst]?item.impact:worst,'NONE');
  return {impact,activeCount:active.length,plannedCount:items.filter(i=>i.state==='PLANNED').length};
}
