import {Controller,Get,Post,Param,Body,UseGuards,BadRequestException,ParseUUIDPipe} from '@nestjs/common';
import {CreateSupportRequestSchema,SupportMessageInputSchema,ResolveSupportRequestSchema} from '@cyris/contracts';
import {AuthGuard} from '../auth/guards/auth.guard.js';
import {CurrentUser} from '../auth/decorators/current-user.decorator.js';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {SupportService} from './support.service.js';
@Controller('events/:eventId/support')
@UseGuards(AuthGuard)
export class SupportController{
  constructor(private readonly service:SupportService){}
  @Get()
  list(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser){return this.service.list(eventId,user);}
  @Post()
  create(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser,@Body() body:unknown){
    const parsed=CreateSupportRequestSchema.safeParse(body);if(!parsed.success)throw new BadRequestException('Invalid support request');
    return this.service.create(eventId,user,parsed.data);
  }
  @Post(':id/reply')
  reply(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:unknown){
    const parsed=SupportMessageInputSchema.safeParse(body);if(!parsed.success)throw new BadRequestException('Invalid support response');
    return this.service.reply(eventId,id,user,parsed.data);
  }
  @Post(':id/resolve')
  resolve(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:unknown){
    const parsed=ResolveSupportRequestSchema.safeParse(body);if(!parsed.success)throw new BadRequestException('Invalid support resolution');
    return this.service.resolve(eventId,id,user,parsed.data.expectedRevision);
  }
}
