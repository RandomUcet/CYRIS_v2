import { Permissions, type PermissionKey } from '@cyris/shared';

export interface VisibleActivity {
  eventId: string;
  resourceId: string | null;
  relatedResourceIds?: string[] | null;
  activityType: string;
  actorUserId: string | null;
  visibility: string;
  metadata: unknown;
}

export interface ActivityResource {
  eventId: string;
  resourceType: string;
  owningUnitId: string | null;
  ownerUserId: string | null;
  explicitlyGranted: boolean;
}

export interface ActivityReader {
  eventId: string;
  userId: string;
  unitIds: readonly string[];
  platformAdmin: boolean;
  eventTimeline: boolean;
  scenarioReader: boolean;
  resource(id: string): Promise<ActivityResource | null>;
  canReadResource(id: string, permission: PermissionKey): Promise<boolean>;
  hasEventPermission(permission: PermissionKey): Promise<boolean>;
}

const domainPermissions: Record<string, PermissionKey> = {
  medical: Permissions.MEDICAL_READ,
  evaluation: Permissions.EVALUATION_READ,
  task: Permissions.TASK_READ,
  lab: Permissions.LAB_READ,
  case: Permissions.CASE_READ,
  incident: Permissions.INCIDENT_READ,
  evidence: Permissions.EVIDENCE_READ,
  forensics: Permissions.FORENSICS_READ,
  forensic: Permissions.FORENSICS_READ,
  court: Permissions.COURT_READ,
  document: Permissions.DOCUMENT_READ,
  indicator: Permissions.INDICATOR_READ,
};

/** One policy for event feeds, case/resource timelines, command and AI inputs. */
export async function canReadActivity(row: VisibleActivity, reader: ActivityReader): Promise<boolean> {
  // Event boundaries also apply to administrators and to causal/related rows.
  if (row.eventId !== reader.eventId) return false;
  if (reader.platformAdmin) return true;
  if (!['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO'].includes(row.visibility)) return false;
  if (row.visibility === 'SCENARIO' && !reader.scenarioReader) return false;

  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown> : {};
  const rawAudience = metadata.audience;
  let audienceMatches = false;
  if (rawAudience !== undefined) {
    if (!rawAudience || typeof rawAudience !== 'object') return false;
    const audience = rawAudience as { type?: unknown; id?: unknown };
    if (audience.type === 'EVENT' && (audience.id === null || audience.id === undefined)) {
      audienceMatches = row.visibility === 'EVENT' && reader.eventTimeline;
    } else if (audience.type === 'USER' && typeof audience.id === 'string') {
      audienceMatches = audience.id === reader.userId;
    } else if (audience.type === 'UNIT' && typeof audience.id === 'string') {
      audienceMatches = reader.unitIds.includes(audience.id);
    } else {
      return false;
    }
    if (!audienceMatches && !reader.scenarioReader) return false;
  }

  // Historical release rows have no recoverable recipient snapshot. Do not
  // expose their content to every event member just because they said EVENT.
  if (row.activityType === 'briefing.delivered' && rawAudience === undefined && !reader.scenarioReader) {
    return false;
  }

  const ids = new Set([...(row.resourceId ? [row.resourceId] : []), ...(row.relatedResourceIds ?? [])]);
  let primary: ActivityResource | null = null;
  for (const id of ids) {
    const resource = await reader.resource(id);
    if (!resource || resource.eventId !== reader.eventId) return false;
    if (!(await reader.canReadResource(id, Permissions.TIMELINE_READ))) return false;
    if (id === row.resourceId) primary = resource;
  }

  if (row.visibility === 'UNIT' || row.visibility === 'RESTRICTED') {
    if (!audienceMatches && !reader.scenarioReader) {
      if (!primary) return false;
      const ownedOrGranted = primary.ownerUserId === reader.userId || primary.explicitlyGranted;
      const inOwningUnit = primary.owningUnitId !== null && reader.unitIds.includes(primary.owningUnitId);
      if (!ownedOrGranted && !(row.visibility === 'UNIT' && inOwningUnit)) return false;
    }
  }
  if (!row.resourceId && row.visibility === 'EVENT' && !reader.eventTimeline) return false;

  const domainPermission = domainPermissions[row.activityType.split('.')[0] ?? ''];
  if (domainPermission) {
    if (row.resourceId) {
      if (!(await reader.canReadResource(row.resourceId, domainPermission))) return false;
    } else if (!(await reader.hasEventPermission(domainPermission))) {
      return false;
    }
  }
  return true;
}
