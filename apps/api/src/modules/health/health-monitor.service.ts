import {Injectable,Logger,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {and,eq,isNull,or,gt,sql} from 'drizzle-orm';
import {notifications,roleAssignments,rolePermissions,roles,users,previewTeamAccounts} from '@cyris/db';
import {Permissions,PermissionScopes,generateId} from '@cyris/shared';
import {DatabaseService} from '../database/database.service.js';
import {HealthService} from './health.service.js';
import {sampleHealth,healthAlertKey,type HealthSamples} from './health-monitor-policy.js';

@Injectable()
export class HealthMonitorService implements OnModuleInit,OnModuleDestroy{
 private readonly logger=new Logger(HealthMonitorService.name);
 private timer:ReturnType<typeof setInterval>|undefined;
 private busy=false;private stopped=false;private samples:HealthSamples={};
 constructor(private readonly health:HealthService,private readonly db:DatabaseService){}
 onModuleInit(){if(process.env.CYRIS_HEALTH_MONITOR!=='true')return;this.timer=setInterval(()=>{void this.tick();},60000);this.timer.unref();}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearInterval(this.timer);}
 async tick(){
  if(this.busy||this.stopped)return;this.busy=true;
  try{
   const {response}=await this.health.getReadiness();
   const {samples,alerts}=sampleHealth(this.samples,Object.fromEntries(Object.entries(response.dependencies).map(([k,v])=>[k,v.status])));
   this.samples=samples;if(!alerts.length||this.stopped)return;
   const now=new Date();
   await this.db.client.transaction(async tx=>{
    // Database constraint and conflict handling guarantee cross-replica dedup.
    // No provider call or external delivery inside this transaction.
    const admins=await tx.selectDistinct({id:users.id}).from(roleAssignments).innerJoin(roles,eq(roles.id,roleAssignments.roleId)).innerJoin(rolePermissions,eq(rolePermissions.roleId,roles.id)).innerJoin(users,eq(users.id,roleAssignments.userId)).leftJoin(previewTeamAccounts,eq(previewTeamAccounts.userId,users.id)).where(and(isNull(roleAssignments.membershipId),isNull(roleAssignments.unitId),isNull(roles.eventId),eq(rolePermissions.permissionKey,Permissions.PLATFORM_MANAGE),eq(rolePermissions.scope,PermissionScopes.PLATFORM),eq(users.status,'ACTIVE'),or(isNull(users.testExpiresAt),gt(users.testExpiresAt,now)),isNull(previewTeamAccounts.userId)));
    for(const key of alerts)if(admins.length)await tx.insert(notifications).values(admins.map(admin=>({id:generateId(),userId:admin.id,eventId:null,type:'PLATFORM_HEALTH',severity:'URGENT',templateKey:'platform.health.degraded',templateParams:{service:key},actionUrl:'/admin/health',sourceEventId:healthAlertKey(key,now.getTime())}))).onConflictDoNothing({target:[notifications.sourceEventId,notifications.userId,notifications.type]});
   });
  }catch{this.samples={};this.logger.warn('Platform health monitoring sample unavailable; no notification generated.');}
  finally{this.busy=false;}
 }
}
