/** Aggregate-only, UTC-based timelines for CYRIS after-action reporting.
 * No subject names, medical contents, or individual activity are exposed.
 */
export interface AuditDayCount {
  day: string;
  auditEvents: number;
  denied: number;
  failures: number;
}
export interface OperationalDayCount {
  day: string;
  operationalEvents: number;
}
export interface DailyActivityPoint {
  day: string;
  auditEvents: number;
  operationalEvents: number;
  denied: number;
  failures: number;
}
const validUtcDay = /^\d{4}-\d{2}-\d{2}$/;
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function mergeActivityDays(
  audited: readonly AuditDayCount[], operational: readonly OperationalDayCount[],
): DailyActivityPoint[] {
  const days = new Map<string, DailyActivityPoint>();
  function get(day:string) {
    if (!validUtcDay.test(day)) throw new Error('Invalid UTC activity day');
    let point=days.get(day);
    if (!point) {
      point={ day, auditEvents:0, operationalEvents:0, denied:0, failures:0 };
      days.set(day,point);
    }
    return point;
  }
  for (const row of audited) {
    const point=get(row.day);
    point.auditEvents+=integer(row.auditEvents);
    point.denied+=integer(row.denied);
    point.failures+=integer(row.failures);
  }
  for (const row of operational) {
    get(row.day).operationalEvents+=integer(row.operationalEvents);
  }
  return [...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
}

/** A selected subset is *only* a snapshot, NEVER an executable deletion plan.
 * Unknown labels and oversized selection lists are rejected, not ignored.
 */
export function previewResourceSelection(
  counts: Readonly<Record<string,number>>,
  selected: readonly string[] | undefined,
) {
  const known=Object.keys(counts).sort();
  if (known.length > 2000) throw new Error('Resource type inventory exceeds safety cap');
  if (selected && (selected.length > 2000 ||
      selected.some(type=>!known.includes(type) || type.length>64))) {
    throw new Error('Invalid resource type selection for this event');
  }
  const selectedTypes=selected && selected.length ? [...new Set(selected)].sort() : known;
  const selectedSet=new Set(selectedTypes);
  const directlyCounted=Object.fromEntries(Object.entries(counts)
    .filter(([type])=>selectedSet.has(type)));
  const matchingResources=Object.values(directlyCounted).reduce((sum,value)=>sum+integer(value),0);
  const totalResources=Object.values(counts).reduce((sum,value)=>sum+integer(value),0);
  return {
    resourceTypes:selectedTypes,
    matchingResources, unselectedResources:Math.max(0,totalResources-matchingResources),
    directlyCounted,
  };
}
