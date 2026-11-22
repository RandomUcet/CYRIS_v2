/** Fair support routing without exposing a chooser to requesting participants. */
export function chooseEligibleResponder(
  eligible: readonly string[], activeAssignments: readonly (string | null)[],
  exclude?: string,
): string | null {
  const unique = [...new Set(eligible)].filter(id => id && id !== exclude).sort();
  if (!unique.length) return null;
  const loads = new Map(unique.map(id => [id, 0]));
  for (const id of activeAssignments) if (id && loads.has(id)) loads.set(id, loads.get(id)! + 1);
  unique.sort((a, b) => (loads.get(a)! - loads.get(b)!) || a.localeCompare(b));
  return unique[0] ?? null;
}
