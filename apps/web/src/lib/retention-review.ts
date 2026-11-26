import type {EventRetentionPlan,RetentionInventoryReport,RetentionRelationalInventory} from '@cyris/contracts';
type Comparison='MISSING'|'LEGACY'|'MISMATCH'|'MATCH';
function shape(v:RetentionRelationalInventory){
  return JSON.stringify([
    v.resetRows,v.removeRows,v.auditRows,v.checkedForeignKeys,
    v.tables.map(t=>[t.table,t.count,t.reset,t.remove]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),
    [...v.unknownTables].sort(),[...v.missingTables].sort(),[...v.unsupportedTables].sort(),
    v.conflicts.map(c=>JSON.stringify([c.child,c.parent,c.constraint,c.count])).sort(),
    [...v.unresolved].sort()
  ]);
}
/** Comparison of read-only aggregates, not identity, freshness or approval. */
export function compareRetentionSnapshots(eventId:string,plan:EventRetentionPlan|null,host:RetentionInventoryReport|null):Comparison{
  if(!plan||!host)return 'MISSING';
  if(plan.eventId!==eventId||host.eventId!==eventId||plan.status!==host.status)return 'MISMATCH';
  if(!host.relational)return 'LEGACY';
  return shape(plan.relational)===shape(host.relational)?'MATCH':'MISMATCH';
}
