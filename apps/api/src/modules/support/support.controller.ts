import {Controller,Get,Post,Param,Body,UseGuards,BadRequestException,ParseUUIDPipe,Header,HttpCode,Query,Req} from '@nestjs/common';
import {CreateSupportRequestSchema,SupportMessageInputSchema,ResolveSupportRequestSchema,SupportAssistInputSchema,SupportInboxQuerySchema} from '@cyris/contracts';
import {AuthGuard,type CyrisRequest} from '../auth/guards/auth.guard.js';
import {CurrentUser} from '../auth/decorators/current-user.decorator.js';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {SupportService} from './support.service.js';
import {SupportAssistService} from './support-assist.service.js';
@Controller('events/:eventId/support')
@UseGuards(AuthGuard)
export class SupportController{
  constructor(private readonly service:SupportService,private readonly assistance:SupportAssistService){}
  @Get()
  list(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser,@Query() query:unknown){
    const parsed = SupportInboxQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException('Invalid support inbox query');
    return this.service.list(eventId, user, parsed.data);
  }
  @Post()
  create(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser,@Body() body:unknown){
    const parsed=CreateSupportRequestSchema.safeParse(body);if(!parsed.success)throw new BadRequestException('Invalid support request');
    return this.service.create(eventId,user,parsed.data);
  }
  @Post('assist')
  @HttpCode(200)
  @Header('Cache-Control','private, no-store')
  assist(@Param('eventId',ParseUUIDPipe) eventId:string,@Req() request:CyrisRequest,@Body() body:unknown){
    const parsed=SupportAssistInputSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException('Invalid support assistance request');
    return this.assistance.assist(eventId,request.user!,request.sessionToken,parsed.data);
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
