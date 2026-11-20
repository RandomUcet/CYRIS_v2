import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { eventMemberships, exerciseDisruptions, membershipUnitAssignments, MembershipStatus, organizationalUnits, type CyrisDatabase } from '@cyris/db';
import type { RestrictedServiceMode, ServiceModule } from '@cyris/contracts';
import { resolveModuleImpacts } from './disruption-policy.js';

/** Read effective modes only. The caller supplies admin status from server-side authorization. */
export async function readModuleImpacts(
  db: Pick<CyrisDatabase, 'select'>,
  eventId: string,
  userId: string,
  isPlatformAdmin = false,
): Promise<ReadonlyMap<ServiceModule, RestrictedServiceMode>> {
  if (isPlatformAdmin) return new Map();
  const now = new Date();
  const assignedUnits = db.select({ id: organizationalUnits.id })
    .from(membershipUnitAssignments)
    .innerJoin(organizationalUnits, eq(organizationalUnits.id, membershipUnitAssignments.unitId))
    .where(and(
      eq(membershipUnitAssignments.membershipId, eventMemberships.id),
      eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt),
    ));
  const rows = await db.select({ module: exerciseDisruptions.module, mode: exerciseDisruptions.mode })
    .from(exerciseDisruptions)
    .innerJoin(eventMemberships, and(
      eq(eventMemberships.eventId, exerciseDisruptions.eventId),
      eq(eventMemberships.userId, userId), eq(eventMemberships.status, MembershipStatus.ACTIVE),
    ))
    .where(and(
      eq(exerciseDisruptions.eventId, eventId), isNull(exerciseDisruptions.restoredAt),
      lte(exerciseDisruptions.startsAt, now),
      or(isNull(exerciseDisruptions.expiresAt), gt(exerciseDisruptions.expiresAt, now)),
      inArray(exerciseDisruptions.mode, ['UNAVAILABLE', 'READ_ONLY']),
      or(
        eq(exerciseDisruptions.targetType, 'EVENT'),
        and(eq(exerciseDisruptions.targetType, 'USER'), eq(exerciseDisruptions.targetId, userId)),
        and(eq(exerciseDisruptions.targetType, 'UNIT'), inArray(exerciseDisruptions.targetId, assignedUnits)),
      ),
    ));
  return resolveModuleImpacts(rows);
}
