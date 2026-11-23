import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { exerciseBroadcastPlans, events, organizationalUnits } from '@cyris/db';
import { Permissions } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type {
  ExerciseBroadcastPlanInput, ExerciseBroadcastPlanResponse,
  ExerciseBroadcastPlanRevision, ExerciseBroadcastPlanTransition,
} from '@cyris/contracts';

type Tx = Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];

@Injectable()
export class ExerciseBroadcastPlansService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private async assertOrganizer(eventId:string,actor:AuthenticatedUser) {
    await this.authz.assertAuthorized({
      user:actor,permission:Permissions.SCENARIO_MANAGE,context:{eventId},
    });
  }

  private async assertAudience(tx:Tx,eventId:string,audience:'ALL'|'UNIT',unitId?:string|null) {
    const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).limit(1);
    if(!event)throw new NotFoundException('Exercise not found');
    if(['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is closed');
    if(audience==='UNIT'){
      if(!unitId)throw new BadRequestException('Select a receiving team');
      const [unit]=await tx.select({id:organizationalUnits.id}).from(organizationalUnits).where(and(
        eq(organizationalUnits.id,unitId),eq(organizationalUnits.eventId,eventId),
        isNull(organizationalUnits.archivedAt),
      )).limit(1);
      if(!unit)throw new BadRequestException('Receiving team is unavailable');
    } else if(unitId)throw new BadRequestException('Remove unit selection for everyone');
  }

  private response(row:typeof exerciseBroadcastPlans.$inferSelect):ExerciseBroadcastPlanResponse {
    return {
      id:row.id,eventId:row.eventId,
      kind:row.kind as ExerciseBroadcastPlanResponse['kind'],
      audience:row.audience as 'ALL'|'UNIT',
      unitId:row.unitId,title:row.title,message:row.message,
      status:row.status as ExerciseBroadcastPlanResponse['status'],
      scheduledAt:row.scheduledAt?.toISOString()??null,
      sentAt:row.sentAt?.toISOString()??null,deliveredCount:row.deliveredCount,
      revision:row.revision,failureCode:row.failureCode,
      createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
    };
  }

  private validSchedule(value:string):Date {
    const time=new Date(value);
    const seconds=(time.getTime()-Date.now())/1000;
    if(!Number.isFinite(seconds)||seconds<10||seconds>90*24*3600) {
      throw new BadRequestException('Schedule between 10 seconds and 90 days into the future');
    }
    return time;
  }

  async list(eventId:string,actor:AuthenticatedUser):Promise<ExerciseBroadcastPlanResponse[]> {
    await this.assertOrganizer(eventId,actor);
    const records=await this.database.client.select().from(exerciseBroadcastPlans)
      .where(eq(exerciseBroadcastPlans.eventId,eventId))
      .orderBy(desc(exerciseBroadcastPlans.createdAt)).limit(100);
    return records.map(r=>this.response(r));
  }

  async create(eventId:string,actor:AuthenticatedUser,input:ExerciseBroadcastPlanInput,requestId?:string) {
    await this.assertOrganizer(eventId,actor);
    return this.database.client.transaction(async tx=>{
      await this.assertAudience(tx,eventId,input.audience,input.unitId);
      const scheduledAt=input.scheduledAt?this.validSchedule(input.scheduledAt):null;
      const [created]=await tx.insert(exerciseBroadcastPlans).values({
        id:input.nonce,eventId,createdByUserId:actor.id,kind:input.kind,
        audience:input.audience,unitId:input.unitId??null,
        title:input.title,message:input.message,
        status:scheduledAt?'SCHEDULED':'DRAFT',scheduledAt,
      }).onConflictDoNothing().returning();
      if(!created){
        const [existing]=await tx.select().from(exerciseBroadcastPlans).where(eq(exerciseBroadcastPlans.id,input.nonce)).limit(1);
        if(existing?.eventId===eventId && existing.title===input.title && existing.message===input.message &&
          existing.kind===input.kind && existing.audience===input.audience && existing.unitId===(input.unitId??null) &&
          (existing.scheduledAt?.toISOString()??null)===(scheduledAt?.toISOString()??null)) {
          return this.response(existing);
        }
        throw new ConflictException('Plan identifier is already used');
      }
      await this.audit.record({
        action:scheduledAt?'exercise.broadcast.plan.scheduled':'exercise.broadcast.plan.created',
        category:'scenario',eventId,actorUserId:actor.id,requestId,
        resourceType:'exercise_broadcast_plan',resourceId:created.id,
        metadata:{kind:created.kind,audience:created.audience,unitId:created.unitId,
          scheduledAt:scheduledAt?.toISOString()??null},txClient:tx,
      });
      return this.response(created);
    });
  }

  async revise(eventId:string,planId:string,actor:AuthenticatedUser,input:ExerciseBroadcastPlanRevision,requestId?:string) {
    await this.assertOrganizer(eventId,actor);
    if(input.nonce!==planId)throw new BadRequestException('Plan ID cannot be changed');
    return this.database.client.transaction(async tx=>{
      const [plan]=await tx.select().from(exerciseBroadcastPlans).where(and(
        eq(exerciseBroadcastPlans.id,planId),eq(exerciseBroadcastPlans.eventId,eventId))).for('update').limit(1);
      if(!plan)throw new NotFoundException('Plan not found');
      if(plan.status!=='DRAFT'||plan.revision!==input.revision)throw new ConflictException('Draft changed; reload');
      await this.assertAudience(tx,eventId,input.audience,input.unitId);
      const [updated]=await tx.update(exerciseBroadcastPlans).set({
        kind:input.kind,audience:input.audience,unitId:input.unitId??null,
        title:input.title,message:input.message,revision:plan.revision+1,updatedAt:new Date(),
      }).where(eq(exerciseBroadcastPlans.id,planId)).returning();
      await this.audit.record({action:'exercise.broadcast.plan.revised',category:'scenario',
        eventId,actorUserId:actor.id,requestId,resourceType:'exercise_broadcast_plan',resourceId:planId,
        metadata:{revision:updated!.revision},txClient:tx});
      return this.response(updated!);
    });
  }

  async schedule(eventId:string,planId:string,actor:AuthenticatedUser,input:ExerciseBroadcastPlanTransition,requestId?:string) {
    await this.assertOrganizer(eventId,actor);
    if(!input.scheduledAt)throw new BadRequestException('Schedule is required');
    return this.database.client.transaction(async tx=>{
      const [plan]=await tx.select().from(exerciseBroadcastPlans).where(and(
        eq(exerciseBroadcastPlans.id,planId),eq(exerciseBroadcastPlans.eventId,eventId))).for('update').limit(1);
      if(!plan)throw new NotFoundException('Plan not found');
      if(plan.status!=='DRAFT'||plan.revision!==input.revision)throw new ConflictException('Draft changed; reload');
      await this.assertAudience(tx,eventId,plan.audience as 'ALL'|'UNIT',plan.unitId);
      const scheduledAt=this.validSchedule(input.scheduledAt!);
      const [updated]=await tx.update(exerciseBroadcastPlans).set({
        status:'SCHEDULED',scheduledAt,revision:plan.revision+1,updatedAt:new Date(),
      }).where(eq(exerciseBroadcastPlans.id,planId)).returning();
      await this.audit.record({action:'exercise.broadcast.plan.scheduled',category:'scenario',
        eventId,actorUserId:actor.id,requestId,resourceType:'exercise_broadcast_plan',resourceId:planId,
        metadata:{scheduledAt:scheduledAt.toISOString(),revision:updated!.revision},txClient:tx});
      return this.response(updated!);
    });
  }

  async cancel(eventId:string,planId:string,actor:AuthenticatedUser,input:ExerciseBroadcastPlanTransition,requestId?:string) {
    await this.assertOrganizer(eventId,actor);
    return this.database.client.transaction(async tx=>{
      const [plan]=await tx.select().from(exerciseBroadcastPlans).where(and(
        eq(exerciseBroadcastPlans.id,planId),eq(exerciseBroadcastPlans.eventId,eventId))).for('update').limit(1);
      if(!plan)throw new NotFoundException('Plan not found');
      if(!['DRAFT','SCHEDULED'].includes(plan.status) || plan.revision!==input.revision) {
        throw new ConflictException('Plan already changed or delivered; refresh');
      }
      const [updated]=await tx.update(exerciseBroadcastPlans).set({
        status:'CANCELLED',revision:plan.revision+1,updatedAt:new Date(),
      }).where(eq(exerciseBroadcastPlans.id,planId)).returning();
      await this.audit.record({action:'exercise.broadcast.plan.cancelled',category:'scenario',
        eventId,actorUserId:actor.id,requestId,resourceType:'exercise_broadcast_plan',resourceId:planId,
        metadata:{previousStatus:plan.status,revision:updated!.revision},txClient:tx});
      return this.response(updated!);
    });
  }
}
