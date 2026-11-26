import { and, eq, inArray, isNull } from 'drizzle-orm';
import { courtRequests, courtCases, resources, eventMemberships, membershipUnitAssignments, organizationalUnits, MembershipStatus } from '@cyris/db';
import { Permissions } from '@cyris/shared';
import type { MyWorkItem, MyWorkView } from '@cyris/contracts';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type { DatabaseService } from '../database/database.service.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { ResourceAccessService } from '../resources/resource-access.service.js';

/** Same event-level legal-request grant as the canonical court requests API.
 * A queue is a navigation aid, never an alternative authority to read the matter. */
export async function listCourtWork(
  db:DatabaseService['client'],auth:AuthorizationService,access:ResourceAccessService,
  eventId:string,user:AuthenticatedUser,view:MyWorkView
):Promise<MyWorkItem[]>{
  if(view!=='personal'&&view!=='requested')return [];
  if(!await auth.authorize({user,permission:Permissions.COURT_REQUEST_READ,context:{eventId}}))return [];
  let targetFilter;
  if(view==='personal'){
    if(!await auth.authorize({user,permission:Permissions.COURT_REQUEST_RESPOND,context:{eventId}}))return [];
    const membership=await db.select({unitId:membershipUnitAssignments.unitId}).from(eventMemberships)
      .innerJoin(membershipUnitAssignments,eq(membershipUnitAssignments.membershipId,eventMemberships.id))
      .innerJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId))
      .where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.userId,user.id),
        eq(eventMemberships.status,MembershipStatus.ACTIVE),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt)));
    if(!membership.length)return [];
    targetFilter=and(inArray(courtRequests.requestedFromUnitId,membership.map(m=>m.unitId)),inArray(courtRequests.status,['OPEN','IN_PROGRESS']));
  }else{
    targetFilter=eq(courtRequests.requestedByUserId,user.id);
  }
  const rows=await db.select({row:courtRequests,number:courtCases.courtCaseNumber}).from(courtRequests)
    .innerJoin(courtCases,eq(courtCases.id,courtRequests.courtCaseId))
    .innerJoin(resources,eq(resources.id,courtCases.id))
    .where(and(eq(courtRequests.eventId,eventId),eq(courtCases.eventId,eventId),
      eq(resources.eventId,eventId),eq(resources.resourceType,'court_case'),targetFilter));
  const result:MyWorkItem[]=[];
  for(const {row,number} of rows){
    if(!await access.canAccessResource(user,row.courtCaseId,Permissions.COURT_READ))continue;
    result.push({id:row.id,eventId,kind:'COURT_REQUEST',identifier:number,title:row.subject,
      status:row.status,assignedToUserId:null,assignedUnitId:row.requestedFromUnitId,
      updatedAt:row.updatedAt.toISOString(),href:`/events/${eventId}/court/${row.courtCaseId}?tab=requests`});
  }
  return result;
}
