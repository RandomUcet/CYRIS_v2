import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ExerciseBroadcastAudienceQuerySchema, ExerciseBroadcastRequestSchema, ExerciseBroadcastPlanInputSchema, ExerciseBroadcastPlanRevisionSchema, ExerciseBroadcastPlanTransitionSchema } from '@cyris/contracts';
import { AuthGuard, type CyrisRequest } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ExerciseBroadcastService } from './exercise-broadcast.service.js';
import { ExerciseBroadcastPlansService } from './exercise-broadcast-plans.service.js';

@Controller('events/:eventId/notifications')
@UseGuards(AuthGuard)
export class ExerciseBroadcastController {
  constructor(private readonly service: ExerciseBroadcastService, private readonly plans: ExerciseBroadcastPlansService) {}

  @Get('teams')
  listTeams(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.listTeams(eventId, actor);
  }

  @Get('audience')
  preview(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser,
    @Query() query: unknown) {
    const parsed = ExerciseBroadcastAudienceQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid broadcast audience');
    return this.service.preview(eventId, actor, parsed.data);
  }

  @Get('plans')
  listPlans(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() actor:AuthenticatedUser) {
    return this.plans.list(eventId,actor);
  }

  @Post('plans')
  createPlan(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() actor:AuthenticatedUser,
    @Body() body:unknown,@Req() req:CyrisRequest) {
    const parsed=ExerciseBroadcastPlanInputSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException(parsed.error.errors[0]?.message??'Invalid plan');
    return this.plans.create(eventId,actor,parsed.data,req.id);
  }

  @Patch('plans/:planId')
  revisePlan(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('planId',ParseUUIDPipe) planId:string,
    @CurrentUser() actor:AuthenticatedUser,@Body() body:unknown,@Req() req:CyrisRequest) {
    const parsed=ExerciseBroadcastPlanRevisionSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException('Invalid plan revision');
    return this.plans.revise(eventId,planId,actor,parsed.data,req.id);
  }

  @Post('plans/:planId/schedule')
  schedulePlan(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('planId',ParseUUIDPipe) planId:string,
    @CurrentUser() actor:AuthenticatedUser,@Body() body:unknown,@Req() req:CyrisRequest) {
    const parsed=ExerciseBroadcastPlanTransitionSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException('Invalid plan schedule');
    return this.plans.schedule(eventId,planId,actor,parsed.data,req.id);
  }

  @Post('plans/:planId/cancel')
  cancelPlan(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('planId',ParseUUIDPipe) planId:string,
    @CurrentUser() actor:AuthenticatedUser,@Body() body:unknown,@Req() req:CyrisRequest) {
    const parsed=ExerciseBroadcastPlanTransitionSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException('Invalid cancellation');
    return this.plans.cancel(eventId,planId,actor,parsed.data,req.id);
  }

  @Get('broadcasts')
  history(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.history(eventId, actor);
  }

  @Post('broadcasts')
  send(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown, @Req() req: CyrisRequest) {
    const parsed = ExerciseBroadcastRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid broadcast');
    return this.service.send(eventId, actor, parsed.data, req.id);
  }
}
