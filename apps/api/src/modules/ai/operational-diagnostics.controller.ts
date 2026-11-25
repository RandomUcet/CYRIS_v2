import {BadRequestException,Body,Controller,ForbiddenException,Get,HttpException,Post,Req,ServiceUnavailableException,UseGuards} from '@nestjs/common';
import {DiagnosticAnalysisInputSchema,validateDiagnosticEvidence,type DiagnosticAnalysisResult} from '@cyris/contracts';
import {Permissions,PermissionScopes} from '@cyris/shared';
import {AuthGuard,type CyrisRequest} from '../auth/guards/auth.guard.js';
import {PermissionsGuard} from '../authorization/guards/permissions.guard.js';
import {RequirePermission} from '../authorization/decorators/require-permission.decorator.js';
import {CurrentUser} from '../auth/decorators/current-user.decorator.js';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {AIGatewayService} from './ai-gateway.service.js';
import {InferenceError,parseModelJson} from './structured-output.js';

@Controller('admin/diagnostics')
@UseGuards(AuthGuard,PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE,PermissionScopes.PLATFORM)
export class OperationalDiagnosticsController{
 constructor(private readonly gateway:AIGatewayService,private readonly authz:AuthorizationService){}
 @Post('analyze')
 async analyze(@Body() body:unknown,@CurrentUser() user:AuthenticatedUser,@Req() req:CyrisRequest):Promise<DiagnosticAnalysisResult>{
  if(req.viewAs)throw new ForbiddenException('Diagnostics unavailable in preview mode');
  const parsed=DiagnosticAnalysisInputSchema.safeParse(body);
  if(!parsed.success)throw new BadRequestException('Only a valid fixed-category CYRIS diagnostic summary is accepted');
  const {summary,locale}=parsed.data;
  if(!(await this.gateway.getStatus('DGX_SPARK')).enabled)throw new ServiceUnavailableException('Managed Spark is disabled');
  let result;
  try{result=await this.gateway.execute({userId:user.id,operationType:'SYSTEM_DIAGNOSTICS',exclusiveScope:'system-diagnostics',promptTemplateVersion:'diagnostics-v1',messages:[
   {role:'system',content:'You are a read-only CYRIS operations analyst. Input is a bounded count of matching log lines, not incidents. No raw messages or stack traces are present. Do not assert root cause or health. Return only JSON {summary:string,findings:[{service,category,severity:"INFO"|"WARNING"|"HIGH",hypothesis:string,nextCheck:string}]}. At most 7 findings, only unique service/category pairs with positive observed counts. Explain uncertainty and unavailable samples. Suggest non-destructive manual checks in plain language, no commands, code, credentials, restart or config changes. Language: '+(locale==='cs'?'Czech':'English')+'.'},
   {role:'user',content:JSON.stringify(summary)}
  ],options:{temperature:0.1,maxTokens:1400,timeoutMs:90000,reasoning:'disabled',responseFormat:'json_object'}});}
  catch(e){if(e instanceof HttpException)throw e;throw new ServiceUnavailableException(e instanceof InferenceError?'Spark inference failed: '+e.category:'Spark inference unavailable');}
  await this.authz.assertAuthorized({user,permission:Permissions.PLATFORM_MANAGE});
  try{
   const report=validateDiagnosticEvidence(summary,parseModelJson(result.text,12000));
   return {report,source:summary,analyzedAt:new Date().toISOString(),model:result.model,durationMs:result.durationMs};
  }catch{throw new ServiceUnavailableException('Spark returned an invalid or unsupported diagnostic report');}
 }
}
