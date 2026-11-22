import {Injectable,ForbiddenException,NotFoundException,ConflictException,BadRequestException} from '@nestjs/common';
import {and,eq,desc,asc,inArray,ilike,sql,isNull,ne} from 'drizzle-orm';
import {events,eventMemberships,MembershipStatus,users,supportRequests,supportMessages,roleAssignments,roles,rolePermissions} from '@cyris/db';
import {Permissions,PermissionScopes} from '@cyris/shared';
import type {CreateSupportRequest,SupportInbox,SupportInboxQuery,SupportThread,SupportMessageInput,SupportAssignee,AssignSupportRequest} from '@cyris/contracts';
import {DatabaseService} from '../database/database.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {AuditService} from '../audit/audit.service.js';
import {nextSupportReply} from './support-policy.js';
import {supportSubjectContainsPattern} from './support-search-policy.js';
import {chooseEligibleResponder} from './support-assignment-policy.js';
import type {AuthenticatedUser} from '../auth/session.service.js';

type Tx = Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];

@Injectable()
export class SupportService {
  constructor(private readonly database:DatabaseService,private readonly authz:AuthorizationService,private readonly audit:AuditService){}
  private get db(){return this.database.client;}
  canManage(eventId:string,user:AuthenticatedUser){
    return this.authz.authorize({user,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});
  }
  private async access(eventId:string,user:AuthenticatedUser){
    const [event]=await this.db.select({id:events.id}).from(events).where(eq(events.id,eventId)).limit(1);
    if(!event)throw new NotFoundException('Exercise not found');
    const canManage=await this.canManage(eventId,user);
    if(!canManage){
      const [member]=await this.db.select({id:eventMemberships.id}).from(eventMemberships).where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.userId,user.id),eq(eventMemberships.status,MembershipStatus.ACTIVE))).limit(1);
      if(!member)throw new ForbiddenException('Support requires active exercise membership');
    }
    return canManage;
  }
  private async eligibleResponderIds(eventId: string, tx: Tx): Promise<string[]> {
    const candidates = await tx.select({ userId: eventMemberships.userId }).from(eventMemberships)
      .innerJoin(users, eq(users.id, eventMemberships.userId))
      .innerJoin(roleAssignments, eq(roleAssignments.membershipId, eventMemberships.id))
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .where(and(
        eq(eventMemberships.eventId, eventId), eq(roles.eventId, eventId),
        eq(eventMemberships.status, MembershipStatus.ACTIVE), eq(users.status, 'ACTIVE'),
        isNull(roleAssignments.userId), eq(rolePermissions.permissionKey, Permissions.SCENARIO_MANAGE),
        eq(rolePermissions.scope, PermissionScopes.EVENT),
      ));
    return [...new Set(candidates.map(row => row.userId))].sort();
  }

  async eligibleAssignees(eventId: string, user: AuthenticatedUser): Promise<SupportAssignee[]> {
    await this.access(eventId, user);
    if (!(await this.canManage(eventId, user))) throw new ForbiddenException('Only exercise support managers can assign requests');
    const candidates = await this.db.transaction(tx => this.eligibleResponderIds(eventId, tx));
    if (!candidates.length) return [];
    const [staff, active] = await Promise.all([
      this.db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, candidates)),
      this.db.select({ id: supportRequests.assignedToUserId }).from(supportRequests)
        .where(and(eq(supportRequests.eventId, eventId), ne(supportRequests.status, 'RESOLVED'))),
    ]);
    return staff.map(member => ({
      id: member.id, displayName: member.displayName,
      activeLoad: active.filter(request => request.id === member.id).length,
    })).sort((a,b) => a.activeLoad - b.activeLoad || a.displayName.localeCompare(b.displayName));
  }

  async assign(eventId: string, id: string, user: AuthenticatedUser, input: AssignSupportRequest) {
    const {canManage} = await this.load(eventId, id, user);
    if (!canManage) throw new ForbiddenException('Only support managers can reassign requests');
    return this.db.transaction(async tx => {
      const eligible = await this.eligibleResponderIds(eventId, tx);
      if (input.assignedToUserId && !eligible.includes(input.assignedToUserId))
        throw new BadRequestException('Select an active exercise support responder');
      const [updated] = await tx.update(supportRequests).set({
        assignedToUserId: input.assignedToUserId, revision: input.expectedRevision + 1,
        updatedAt: new Date(),
      }).where(and(eq(supportRequests.eventId, eventId), eq(supportRequests.id, id),
        eq(supportRequests.revision, input.expectedRevision), ne(supportRequests.status, 'RESOLVED')))
        .returning({ id: supportRequests.id });
      if (!updated) throw new ConflictException('Request was modified; reload before reassigning');
      await this.audit.record({
        action: 'support.request.reassigned', category: 'support', eventId, actorUserId: user.id,
        resourceType: 'support_request', resourceId: id,
        metadata: { assignedToUserId: input.assignedToUserId }, txClient: tx,
      });
      return updated;
    });
  }

  async list(eventId: string, user: AuthenticatedUser, query: SupportInboxQuery = {}): Promise<SupportInbox> {
    const canManage = await this.access(eventId, user);
    const audience = and(eq(supportRequests.eventId, eventId), canManage ? undefined : eq(supportRequests.requesterId, user.id));
    // Filter AFTER applying tenant and requester visibility, never across tenants.
    // Escape SQL LIKE wildcards so search always means literal subject text.
    const pattern = query.q ? supportSubjectContainsPattern(query.q) : undefined;
    const scopedAudience = and(audience,
      query.category ? eq(supportRequests.category, query.category) : undefined,
      pattern ? ilike(supportRequests.subject, pattern) : undefined,
    );
    const filter = and(scopedAudience, query.status ? eq(supportRequests.status, query.status) : undefined);
    const order = canManage ? [
      desc(sql`${supportRequests.status} = 'OPEN'`),
      asc(sql`case when ${supportRequests.status} = 'OPEN' then ${supportRequests.updatedAt} end`),
      desc(supportRequests.updatedAt), asc(supportRequests.id),
    ] : [desc(supportRequests.updatedAt), asc(supportRequests.id)];
    const selectRows = () => this.db.select({ thread: supportRequests, name: users.displayName }).from(supportRequests)
      .innerJoin(users, eq(users.id, supportRequests.requesterId));
    // Older clients expect the latest 100 threads with full conversations.
    // The operator console pages summaries and loads messages only for its open thread.
    const paged = query.page !== undefined;
    const pageSize = paged ? 25 : 100;
    const page = query.page ?? 1;
    const [rows, selectedRows, totals] = await Promise.all([
      selectRows().where(filter).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
      query.threadId ? selectRows().where(and(audience, eq(supportRequests.id, query.threadId))).limit(1) : [],
      paged ? this.db.select({
        status: supportRequests.status, count: sql<number>`count(*)::integer`,
        latest: sql<string>`max(${supportRequests.updatedAt})::text`,
      }).from(supportRequests).where(scopedAudience).groupBy(supportRequests.status) : [],
    ]);
    const messageIds = paged ? selectedRows.map(r => r.thread.id) : rows.map(r => r.thread.id);
    const groups = new Map<string, SupportThread['messages']>();
    if (messageIds.length) {
      const messages = await this.db.select().from(supportMessages).where(inArray(supportMessages.requestId, messageIds))
        .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
      for (const message of messages) {
        const items = groups.get(message.requestId) ?? [];
        items.push({ id: message.id, authorKind: message.authorKind as 'EXCON' | 'PARTICIPANT', body: message.body, createdAt: message.createdAt.toISOString() });
        groups.set(message.requestId, items);
      }
    }
    const assignedIds = [...new Set([...rows, ...selectedRows].map(row => row.thread.assignedToUserId)
      .filter((id): id is string => Boolean(id)))];
    const assigneeNames = assignedIds.length
      ? await this.db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, assignedIds))
      : [];
    const nameById = new Map(assigneeNames.map(row => [row.id, row.name]));
    const serialize = ({thread, name}: typeof rows[number]): SupportThread => ({
      ...thread, requesterName: name,
      assignedToName: thread.assignedToUserId ? nameById.get(thread.assignedToUserId) ?? null : null,
      category: thread.category as SupportThread['category'], status: thread.status as SupportThread['status'],
      createdAt: thread.createdAt.toISOString(), updatedAt: thread.updatedAt.toISOString(), messages: groups.get(thread.id) ?? [],
    });
    const result = { canManage, threads: rows.map(row => paged ? { ...serialize(row), messages: [] } : serialize(row)) };
    if (!paged) return result;
    const open = totals.find(item => item.status === 'OPEN');
    return {
      ...result, page, pageSize, waiting: open?.count ?? 0, queueRevision: (open?.latest ?? '') + '/' + (open?.count ?? 0),
      total: totals.reduce((sum, item) => sum + (!query.status || item.status === query.status ? item.count : 0), 0),
      selectedThread: selectedRows[0] ? serialize(selectedRows[0]) : null,
    };
  }
  async create(eventId:string,user:AuthenticatedUser,input:CreateSupportRequest){
    await this.access(eventId,user);
    return this.db.transaction(async tx=>{
      // Serialize routing for this exercise to prevent two concurrent tickets
      // choosing the same responder before the workload counts are updated.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ 'support-queue:' + eventId }, 0))`);
      const candidates = await this.eligibleResponderIds(eventId, tx);
      const active = await tx.select({ assignee: supportRequests.assignedToUserId }).from(supportRequests)
        .where(and(eq(supportRequests.eventId, eventId), ne(supportRequests.status, 'RESOLVED')));
      const assignedToUserId = chooseEligibleResponder(candidates, active.map(item => item.assignee), user.id);
      const [thread]=await tx.insert(supportRequests).values({eventId,requesterId:user.id,
        category:input.category,subject:input.subject,assignedToUserId}).returning();
      if(!thread)throw new ConflictException('Support request not created');
      await tx.insert(supportMessages).values({requestId:thread.id,authorId:user.id,authorKind:'PARTICIPANT',body:input.body});
      await this.audit.record({action:'support.request.created',category:'support',eventId,actorUserId:user.id,resourceType:'support_request',resourceId:thread.id,metadata:{category:input.category,assignedToUserId},txClient:tx});
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
    const transition=nextSupportReply(row.status,canManage,user.id,row.requesterId);
    if(!transition)throw new ConflictException('Request is resolved or inaccessible');
    const {authorKind,status}=transition;
    return this.db.transaction(async tx=>{
      const [updated]=await tx.update(supportRequests).set({status,revision:input.expectedRevision+1,updatedAt:new Date()}).where(and(eq(supportRequests.id,id),eq(supportRequests.eventId,eventId),eq(supportRequests.revision,input.expectedRevision))).returning({id:supportRequests.id});
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
