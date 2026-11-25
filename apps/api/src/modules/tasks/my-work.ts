import type { MyWorkItem } from '@cyris/contracts';

export function isActionableMyWorkItem(item: Pick<MyWorkItem, 'kind' | 'status'>): boolean {
  return item.kind === 'TASK'
    ? !['COMPLETED', 'CANCELLED'].includes(item.status)
    : !['APPROVED', 'REJECTED', 'CANCELLED'].includes(item.status);
}

export function isMyWorkViewAllowed(
  view: 'personal' | 'unit' | 'event' | 'requested',
  canViewUnit: boolean,
  canViewEvent: boolean,
  unitSelected: boolean
): boolean {
  return view === 'personal' || view === 'requested' ||
    (view === 'unit' && canViewUnit && unitSelected) ||
    (view === 'event' && canViewEvent);
}

export function sortAndPaginateMyWork(
  items: MyWorkItem[],
  page: number,
  limit: number
): { items: MyWorkItem[]; total: number } {
  const sorted = [...items].sort((a, b) => {
    const time = b.updatedAt.localeCompare(a.updatedAt);
    return time || b.id.localeCompare(a.id);
  });
  const start = (page - 1) * limit;
  return { items: sorted.slice(start, start + limit), total: sorted.length };
}
