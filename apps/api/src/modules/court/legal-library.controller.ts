import {Controller,Get,Post,Body,Query,Param,ParseUUIDPipe,UseGuards,BadRequestException} from '@nestjs/common';
import {LegalSourceInputSchema,LegalSearchSchema,LegalResearchInputSchema} from '@cyris/contracts';
import {AuthGuard} from '../auth/guards/auth.guard.js';
import {CurrentUser} from '../auth/decorators/current-user.decorator.js';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {LegalLibraryService} from './legal-library.service.js';
@Controller('events/:eventId/legal-library')
@UseGuards(AuthGuard)
export class LegalLibraryController{
 constructor(private readonly library:LegalLibraryService){}
 @Get() search(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser,@Query() query:unknown){const p=LegalSearchSchema.safeParse(query);if(!p.success)throw new BadRequestException('Invalid search');return this.library.search(eventId,user,p.data.q,p.data.asOf);}
 @Post() add(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser,@Body() body:unknown){const p=LegalSourceInputSchema.safeParse(body);if(!p.success)throw new BadRequestException('Invalid source or effective dates');return this.library.add(eventId,user,p.data);}
 @Post('research') research(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser,@Body() body:unknown){const p=LegalResearchInputSchema.safeParse(body);if(!p.success)throw new BadRequestException('Invalid research request');return this.library.research(eventId,user,p.data);}
}
