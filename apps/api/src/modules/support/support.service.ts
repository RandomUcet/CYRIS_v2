import {Injectable,ForbiddenException,NotFoundException,ConflictException} from '@nestjs/common';
import {and,eq,desc,asc,inArray} from 'drizzle-orm';
import {events,eventMemberships,MembershipStatus,users,supportRequests,supportMessages} from '@cyris/db';
import {Permissions} from '@cyris/shared';
import type {CreateSupportRequest,SupportInbox,SupportThread,SupportMessageInput} from '@cyris/contracts';
import {DatabaseService} from '../database/database.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {AuditService} from '../audit/audit.service.js';
import type {AuthenticatedUser} from '../auth/session.service.js';

@Injectable()
export class SupportService {
  constructor(private readonly database:DatabaseService,private readonly authz:AuthorizationService,private readonly audit:AuditService){}
  private get db(){return this.database.client;}
  private async access(eventId:string,user:AuthenticatedUser){
    const [event]=await this.db.select({id:events.id}).from(events).where(eq(events.id,eventId)).limit(1);
    if(!event)throw new NotFoundException('Exercise not found');
    const canManage=await this.authz.authorize({user,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});
    if(!canManage){
      const [member]=await this.db.select({id:eventMemberships.id}).from(eventMemberships).where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.userId,user.id),eq(eventMemberships.status,MembershipStatus.ACTIVE))).limit(1);
      if(!member)throw new ForbiddenException('Support requires active exercise membership');
    }
    return canManage;
  }
  async list(eventId:string,user:AuthenticatedUser):Promise<SupportInbox>{
    const canManage=await this.access(eventId,user);
    const rows=await this.db.select({thread:supportRequests,name:users.displayName}).from(supportRequests).innerJoin(users,eq(users.id,supportRequests.requesterId))
      .where(and(eq(supportRequests.eventId,eventId),canManage?undefined:eq(supportRequests.requesterId,user.id))).orderBy(desc(supportRequests.updatedAt)).limit(100);
    const messages=rows.length?await this.db.select().from(supportMessages).where(inArray(supportMessages.requestId,rows.map(r=>r.thread.id))).orderBy(asc(supportMessages.createdAt)):[];
    return {canManage,threads:rows.map(({thread:r,name})=>({
      ...r,requesterName:name,category:r.category as SupportThread['category'],status:r.status as SupportThread['status'],createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),
      messages:messages.filter(m=>m.requestId===r.id).map(m=>({id:m.id,authorKind:m.authorKind as 'PARTICIPANT'|'EXCON',body:m.body,createdAt:m.createdAt.toISOString()})),
    }))};
  }
  async create(eventId:string,user:AuthenticatedUser,input:CreateSupportRequest){
    await this.access(eventId,user);
    return this.db.transaction(async tx=>{
      const [thread]=await tx.insert(supportRequests).values({eventId,requesterId:user.id,category:input.category,subject:input.subject}).returning();
      if(!thread)throw new ConflictException('Support request not created');
      await tx.insert(supportMessages).values({requestId:thread.id,authorId:user.id,authorKind:'PARTICIPANT',body:input.body});
      await this.audit.record({action:'support.request.created',category:'support',eventId,actorUserId:user.id,resourceType:'support_request',resourceId:thread.id,metadata:{category:input.category},txClient:tx});
      return {id:thread.id};
    });
  }
  private async load(eventId:string,id:string,user:AuthenticatedUser){
    const canManage=await this.access(eventId,user);
    const [row]=await this.db.select().from(supportRequests).where(and(eq(supportRequests.id,id),eq(supportRequests.eventId,eventId),canManage?undefined:eq(supportRequests.requesterId,user.id))).limit(1);
    if(!row)throw new NotFoundException('Support request not found');
    return {row,canManage};
  }
  async reply(eventId:string,id:string,user:AuthenticatedUser,input:SupportMessageInput){
    const {row,canManage}=await this.load(eventId,id,user);
    if(row.status==='RESOLVED')throw new ConflictException('Request is resolved; create a new request');
    const authorKind=canManage&&row.requesterId!==user.id?'EXCON':'PARTICIPANT';
    return this.db.transaction(async tx=>{
      const [updated]=await tx.update(supportRequests).set({status:authorKind==='EXCON'?'ANSWERED':'OPEN',revision:input.expectedRevision+1,updatedAt:new Date()}).where(and(eq(supportRequests.id,id),eq(supportRequests.eventId,eventId),eq(supportRequests.revision,input.expectedRevision))).returning({id:supportRequests.id});
      if(!updated)throw new ConflictException('Request changed; reload before replying');
      await tx.insert(supportMessages).values({requestId:id,authorId:user.id,authorKind,body:input.body});
      await this.audit.record({action:'support.request.reply',category:'support',eventId,actorUserId:user.id,resourceType:'support_request',resourceId:id,metadata:{authorKind},txClient:tx});
      return updated;
    });
  }
  async resolve(eventId:string,id:string,user:AuthenticatedUser,revision:number){
    const {row}=await this.load(eventId,id,user);
    if(row.status==='RESOLVED')throw new ConflictException('Request already resolved');
    return this.db.transaction(async tx=>{
      const [updated]=await tx.update(supportRequests).set({status:'RESOLVED',revision:revision+1,updatedAt:new Date()}).where(and(eq(supportRequests.id,id),eq(supportRequests.eventId,eventId),eq(supportRequests.revision,revision))).returning({id:supportRequests.id});
      if(!updated)throw new ConflictException('Request changed; reload before resolving');
      await this.audit.record({action:'support.request.resolved',category:'support',eventId,actorUserId:user.id,resourceType:'support_request',resourceId:id,txClient:tx});
      return updated;
    });
  }
}
