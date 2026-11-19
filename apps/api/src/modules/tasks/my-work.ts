import type { MyWorkItem } from '@cyris/contracts';

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
