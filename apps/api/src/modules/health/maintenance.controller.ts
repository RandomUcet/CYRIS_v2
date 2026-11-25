import {BadRequestException,Body,Controller,ForbiddenException,Post,Req,UseGuards} from '@nestjs/common';
import {AuthGuard,type CyrisRequest} from '../auth/guards/auth.guard.js';
import {CurrentUser} from '../auth/decorators/current-user.decorator.js';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {PermissionsGuard} from '../authorization/guards/permissions.guard.js';
import {RequirePermission} from '../authorization/decorators/require-permission.decorator.js';
import {Permissions,PermissionScopes} from '@cyris/shared';
import {AuditService} from '../audit/audit.service.js';
import {HealthService} from './health.service.js';
import {MaintenanceActionSchema} from '@cyris/contracts';
export {MaintenanceActionSchema} from '@cyris/contracts';

@Controller('admin/maintenance')
@UseGuards(AuthGuard,PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE,PermissionScopes.PLATFORM)
export class MaintenanceController{
 constructor(private readonly health:HealthService,private readonly audit:AuditService){}
 @Post('check')
 async check(@Body() body:unknown,@CurrentUser() user:AuthenticatedUser,@Req() req:CyrisRequest){
  if(req.viewAs)throw new ForbiddenException('Maintenance unavailable in preview mode');
  const parsed=MaintenanceActionSchema.safeParse(body);
  if(!parsed.success)throw new BadRequestException('Unknown maintenance action');
  const action=parsed.data.action;
  await this.audit.record({action:'platform.maintenance.check',category:'system',actorUserId:user.id,requestId:req.id,metadata:{check:action}});
  if(action==='API_STATUS'){const x=this.health.getLiveness();return {action,status:x.status,version:x.version,uptime:x.uptime,timestamp:x.timestamp};}
  const {response}=await this.health.getReadiness();
  // Never expose arbitrary dependency errors, addresses, or credentials.
  return {action,status:response.status,timestamp:response.timestamp,dependencies:Object.fromEntries(Object.entries(response.dependencies).map(([key,v])=>[key,{status:v.status,latencyMs:v.latencyMs}]))};
 }
}
