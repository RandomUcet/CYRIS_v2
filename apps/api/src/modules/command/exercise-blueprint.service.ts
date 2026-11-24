import {Injectable,ConflictException,NotFoundException} from '@nestjs/common';
import {desc,eq,sql} from 'drizzle-orm';
import {events,exerciseBlueprints} from '@cyris/db';
import type {ExerciseBlueprint,ExerciseBlueprintInput,ExerciseBlueprintOverview} from '@cyris/contracts';
import {Permissions} from '@cyris/shared';
import {DatabaseService} from '../database/database.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {AuditService} from '../audit/audit.service.js';
import type {AuthenticatedUser} from '../auth/session.service.js';

export function assertBlueprintRevision(expected:number,actual:number,status:string){
 if(status==='CLOSED'||status==='ARCHIVED')throw new ConflictException('Exercise is read-only');
 if(expected!==actual)throw new ConflictException('Blueprint changed; reload the current revision before saving');
}
@Injectable()
export class ExerciseBlueprintService{
 constructor(private readonly db:DatabaseService,private readonly auth:AuthorizationService,private readonly audit:AuditService){}
 private authorize(eventId:string,actor:AuthenticatedUser){return this.auth.assertAuthorized({user:actor,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});}
 private map(row:typeof exerciseBlueprints.$inferSelect):ExerciseBlueprint{return {...row,updatedAt:row.updatedAt.toISOString()};}
 async overview(eventId:string,actor:AuthenticatedUser):Promise<ExerciseBlueprintOverview>{
  await this.authorize(eventId,actor);
  const rows=await this.db.client.select().from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(20);
  return {current:rows[0]?this.map(rows[0]):null,history:rows.map(({revision,title,updatedAt,updatedBy})=>({revision,title,updatedAt:updatedAt.toISOString(),updatedBy}))};
 }
 async save(eventId:string,actor:AuthenticatedUser,input:ExerciseBlueprintInput):Promise<ExerciseBlueprint>{
  await this.authorize(eventId,actor);
  return this.db.client.transaction(async tx=>{
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext('exercise-blueprint:' || ${eventId}))`);
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);
   assertBlueprintRevision(input.expectedRevision,latest?.revision??0,event.status);
   const {expectedRevision,...content}=input;
   const [row]=await tx.insert(exerciseBlueprints).values({...content,eventId,revision:expectedRevision+1,updatedBy:actor.id}).returning();
   if(!row)throw Error('Blueprint not saved');
   await this.audit.record({txClient:tx,action:'exercise.blueprint.revised',category:'scenario',eventId,actorUserId:actor.id,resourceType:'exercise_blueprint',resourceId:eventId,metadata:{revision:row.revision}});
   return this.map(row);
  });
 }
}
