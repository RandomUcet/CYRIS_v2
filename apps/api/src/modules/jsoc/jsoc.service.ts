import {Injectable,ForbiddenException,NotFoundException,ConflictException} from '@nestjs/common';
import {and,desc,eq,isNull,sql} from 'drizzle-orm';
import {
  jsocSyntheticLogs,events,eventMemberships,MembershipStatus,
  membershipUnitAssignments,organizationalUnits,unitCapabilities
} from '@cyris/db';
import {Permissions,generateId} from '@cyris/shared';
import type {GenerateJsocLogs,JsocLogPage,JsocLogQuery,JsocLog} from '@cyris/contracts';
import {DatabaseService} from '../database/database.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {AuditService} from '../audit/audit.service.js';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {createSyntheticJsocLogs} from './jsoc-fixture.js';

@Injectable()
export class JsocService {
  constructor(
    private readonly database:DatabaseService,
    private readonly authz:AuthorizationService,
    private readonly audit:AuditService,
  ){}
  private get db(){return this.database.client;}
  private async access(eventId:string,user:AuthenticatedUser){
    const [event]=await this.db.select({id:events.id}).from(events).where(eq(events.id,eventId)).limit(1);
    if(!event)throw new NotFoundException('Exercise not found');
    // EXCON manages the simulation. A platform administrator is also authorized through scenario.manage.
    const canGenerate=await this.authz.authorize({user,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});
    if(canGenerate)return true;
    // JSOC requires an active membership in a unit explicitly configured for technical operations.
    // Capability alone is never sufficient: enforce a real event-scoped forensic read grant as well.
    const [technical]=await this.db.select({membershipId:eventMemberships.id})
      .from(eventMemberships)
      .innerJoin(membershipUnitAssignments,eq(membershipUnitAssignments.membershipId,eventMemberships.id))
      .innerJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId))
      .innerJoin(unitCapabilities,eq(unitCapabilities.unitId,organizationalUnits.id))
      .where(and(
        eq(eventMemberships.eventId,eventId),
        eq(eventMemberships.userId,user.id),
        eq(eventMemberships.status,MembershipStatus.ACTIVE),
        eq(organizationalUnits.eventId,eventId),
        isNull(organizationalUnits.archivedAt),
        eq(unitCapabilities.capabilityKey,'technical_operations'),
      )).limit(1);
    if(!technical||!await this.authz.authorize({user,permission:Permissions.FORENSICS_READ,context:{eventId}})){
      throw new ForbiddenException('JSOC exercise telemetry requires technical unit membership and forensics.read');
    }
    return false;
  }
  async list(eventId:string,user:AuthenticatedUser,query:JsocLogQuery):Promise<JsocLogPage>{
    const canGenerate=await this.access(eventId,user);
    const where=and(
      eq(jsocSyntheticLogs.eventId,eventId),
      query.category?eq(jsocSyntheticLogs.category,query.category):undefined,
      query.severity?eq(jsocSyntheticLogs.severity,query.severity):undefined,
      query.search?sql`(${jsocSyntheticLogs.source} ilike ${'%'+query.search+'%'} or ${jsocSyntheticLogs.message} ilike ${'%'+query.search+'%'})`:undefined
    );
    const [rows,total]=await Promise.all([
      this.db.select().from(jsocSyntheticLogs).where(where)
        .orderBy(desc(jsocSyntheticLogs.observedAt),desc(jsocSyntheticLogs.id))
        .limit(query.limit).offset((query.page-1)*query.limit),
      this.db.select({n:sql<number>`count(*)::integer`}).from(jsocSyntheticLogs).where(where),
    ]);
    const items:JsocLog[]=rows.map(row=>({
      id:row.id,eventId:row.eventId,observedAt:row.observedAt.toISOString(),
      category:row.category as JsocLog['category'],
      severity:row.severity as JsocLog['severity'],
      source:row.source,message:row.message,
      sourceAddress:row.sourceAddress,destinationAddress:row.destinationAddress,
      scenario:row.scenario,createdAt:row.createdAt.toISOString(),
    }));
    return {eventId,simulation:true,canGenerate,page:query.page,limit:query.limit,total:total[0]?.n??0,items};
  }
  async generate(eventId:string,user:AuthenticatedUser,input:GenerateJsocLogs){
    const canGenerate=await this.access(eventId,user);
    if(!canGenerate)throw new ForbiddenException('Only EXCON can create simulated technical events');
    const entries=createSyntheticJsocLogs(input,new Date());
    return this.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'jsoc:'+eventId},0))`);
      const [count]=await tx.select({n:sql<number>`count(*)::integer`})
        .from(jsocSyntheticLogs).where(eq(jsocSyntheticLogs.eventId,eventId));
      if((count?.n??0)+entries.length>5000)throw new ConflictException('The exercise has reached the 5000 simulated-log safety limit');
      const rows=entries.map(e=>({
        id:generateId(),eventId,...e,createdByUserId:user.id,
      }));
      await tx.insert(jsocSyntheticLogs).values(rows);
      await this.audit.record({
        action:'jsoc.synthetic_logs.generated',category:'scenario',eventId,
        actorUserId:user.id,resourceType:'jsoc_simulated_dataset',
        metadata:{count:rows.length,seed:input.seed,scenario:input.scenario},txClient:tx,
      });
      return {created:rows.length,simulation:true as const};
    });
  }
}
