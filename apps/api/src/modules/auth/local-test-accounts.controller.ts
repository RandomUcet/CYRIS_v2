import {Controller,Get,Post,Param,Body,UseGuards,ParseUUIDPipe,BadRequestException,ConflictException,NotFoundException,Header} from '@nestjs/common';
import {and,eq,isNull,isNotNull,desc} from 'drizzle-orm';
import {randomBytes} from 'node:crypto';
import {users,userIdentities,events,eventMemberships,organizationalUnits,membershipUnitAssignments,roles,rolePermissions,roleAssignments} from '@cyris/db';
import {validateEventRolePermissions} from '../events/event-role-permissions.js';
import {Permissions,generateId} from '@cyris/shared';
import {CreateLocalTestAccountSchema,type LocalTestAccount,type LocalTestAccountCreated} from '@cyris/contracts';
import {AuthGuard} from './guards/auth.guard.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {PermissionsGuard} from '../authorization/guards/permissions.guard.js';
import {RequirePermission} from '../authorization/decorators/require-permission.decorator.js';
import {CurrentUser} from './decorators/current-user.decorator.js';
import {DatabaseService} from '../database/database.service.js';
import {AuditService} from '../audit/audit.service.js';
import {LocalIdentityProvider} from './providers/local-identity.provider.js';
import {SessionService,type AuthenticatedUser} from './session.service.js';

function dto(row:{id:string;email:string;displayName:string;status:string;testExpiresAt:Date|null}):LocalTestAccount{
 if(!row.testExpiresAt)throw Error('Expected test account');
 return {id:row.id,email:row.email,displayName:row.displayName,expiresAt:row.testExpiresAt.toISOString(),status:row.status!=='ACTIVE'?'DISABLED':row.testExpiresAt.getTime()<=Date.now()?'EXPIRED':'ACTIVE'};
}
@Controller('events/:eventId/local-test-accounts')
@UseGuards(AuthGuard,PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE)
export class LocalTestAccountsController{
 constructor(private readonly db:DatabaseService,private readonly audit:AuditService,private readonly local:LocalIdentityProvider,private readonly sessions:SessionService,private readonly auth:AuthorizationService){}
 @Get()
 @RequirePermission(Permissions.PLATFORM_MANAGE)
 async list(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() actor:AuthenticatedUser){
  await this.auth.assertAuthorized({user:actor,permission:Permissions.PLATFORM_MANAGE});
  const rows=await this.db.client.select({id:users.id,email:users.email,displayName:users.displayName,status:users.status,testExpiresAt:users.testExpiresAt}).from(users).innerJoin(eventMemberships,eq(eventMemberships.userId,users.id)).where(and(eq(eventMemberships.eventId,eventId),isNotNull(users.testExpiresAt))).orderBy(desc(users.createdAt)).limit(100);
  return rows.map(dto);
 }
 @Post()
 @RequirePermission(Permissions.PLATFORM_MANAGE)
 @Header('Cache-Control','no-store')
 async create(@Param('eventId',ParseUUIDPipe) eventId:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser):Promise<LocalTestAccountCreated>{
  await this.auth.assertAuthorized({user:actor,permission:Permissions.PLATFORM_MANAGE});
  const parsed=CreateLocalTestAccountSchema.safeParse(body);if(!parsed.success)throw new BadRequestException('Invalid test account');
  const input=parsed.data,id=generateId(),email='test-'+id+'@test.cyris.invalid',password=randomBytes(24).toString('base64url'),hash=await this.local.hashPassword(password);
  return this.db.client.transaction(async tx=>{
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is read-only');
   const [role]=await tx.select({id:roles.id}).from(roles).where(and(eq(roles.id,input.roleId),eq(roles.eventId,eventId))).limit(1).for('update');
   const [unit]=await tx.select({id:organizationalUnits.id}).from(organizationalUnits).where(and(eq(organizationalUnits.id,input.unitId),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt))).limit(1);
   if(!role||!unit)throw new BadRequestException('Select a role and active unit from this exercise');
   const grants=await tx.select().from(rolePermissions).where(eq(rolePermissions.roleId,role.id));
   if(!grants.length)throw new BadRequestException('Select a role with event permissions');
   validateEventRolePermissions(grants);
   const [row]=await tx.insert(users).values({id,email,displayName:input.displayName,status:'ACTIVE',testExpiresAt:new Date(Date.now()+input.validHours*3600000)}).returning();
   if(!row)throw Error('Account not created');
   await tx.insert(userIdentities).values({userId:id,providerType:'LOCAL',providerSubject:email,passwordHash:hash});
   const membershipId=generateId();
   await tx.insert(eventMemberships).values({id:membershipId,eventId,userId:id,status:'ACTIVE'});
   await tx.insert(membershipUnitAssignments).values({membershipId,unitId:unit.id});
   await tx.insert(roleAssignments).values({membershipId,roleId:role.id,unitId:unit.id});
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'auth.test_account.created',category:'auth',resourceType:'user',resourceId:id,metadata:{roleId:role.id,unitId:unit.id,expiresAt:row.testExpiresAt?.toISOString()}});
   return {...dto(row),password};
  });
 }
 @Post(':userId/disable')
 @RequirePermission(Permissions.PLATFORM_MANAGE)
 async disable(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('userId',ParseUUIDPipe) id:string,@CurrentUser() actor:AuthenticatedUser){
  await this.auth.assertAuthorized({user:actor,permission:Permissions.PLATFORM_MANAGE});
  const result=await this.db.client.transaction(async tx=>{
   const [member]=await tx.select({id:eventMemberships.id}).from(eventMemberships).where(and(eq(eventMemberships.userId,id),eq(eventMemberships.eventId,eventId))).limit(1);
   if(!member)throw new NotFoundException('Test account not found');
   const [row]=await tx.update(users).set({status:'DISABLED',updatedAt:new Date()}).where(and(eq(users.id,id),isNotNull(users.testExpiresAt))).returning();
   if(!row)throw new NotFoundException('Test account not found');
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'auth.test_account.disabled',category:'auth',resourceType:'user',resourceId:id});
   return dto(row);
  });
  // DB status is authoritative even if Redis is temporarily unavailable.
  try{await this.sessions.revokeAllUserSessions(id);}catch{}
  return result;
 }
}
