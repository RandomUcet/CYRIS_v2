import {Controller,Get,Post,Param,Query,Body,UseGuards,ParseUUIDPipe,BadRequestException,Header} from '@nestjs/common';
import {GenerateJsocLogsSchema,JsocLogQuerySchema} from '@cyris/contracts';
import {AuthGuard} from '../auth/guards/auth.guard.js';
import {CurrentUser} from '../auth/decorators/current-user.decorator.js';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {JsocService} from './jsoc.service.js';
@Controller('events/:eventId/jsoc')
@UseGuards(AuthGuard)
export class JsocController {
  constructor(private readonly service:JsocService){}
  @Get('logs')
  @Header('Cache-Control','private, no-store')
  logs(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser,@Query() query:unknown) {
    const parsed=JsocLogQuerySchema.safeParse(query??{});
    if(!parsed.success)throw new BadRequestException('Invalid telemetry query');
    return this.service.list(eventId,user,parsed.data);
  }
  @Post('generate')
  generate(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser,@Body() body:unknown) {
    const parsed=GenerateJsocLogsSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException('Invalid simulation parameters');
    return this.service.generate(eventId,user,parsed.data);
  }
}
