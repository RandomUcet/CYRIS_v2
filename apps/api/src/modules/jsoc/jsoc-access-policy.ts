/**
 * Capability alone is not authorization: require both matching active technical
 * unit membership and forensic read scope, or explicit scenario-management grant.
 */
export function canAccessSimulatedTelemetry(
  canManageScenario:boolean,
  isTechnicalMember:boolean,
  hasForensicsRead:boolean,
):boolean {
  return canManageScenario || (isTechnicalMember && hasForensicsRead);
}
