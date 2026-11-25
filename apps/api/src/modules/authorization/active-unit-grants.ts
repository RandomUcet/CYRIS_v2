/** Unit-bound grants must not survive removal or archival of their unit. */
export function activeUnitGrant(unitId:string|null|undefined, activeUnits:ReadonlySet<string>):boolean {
  return unitId == null || activeUnits.has(unitId);
}
