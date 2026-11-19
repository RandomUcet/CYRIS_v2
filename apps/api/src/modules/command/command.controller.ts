import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { CommandService } from './command.service.js';
import {
  CreateSitrepRequestSchema,
  ChangeCommandDefconRequestSchema,
  type OperationalPictureResponse,
  type DocumentItem,
} from '@cyris/contracts';

@Controller('events/:eventId/command')
@UseGuards(AuthGuard)
export class CommandController {
  constructor(private readonly commandService: CommandService) {}

  @Get('defcon')
  async getDefcon(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandService.getDefcon(eventId, user);
  }

  @Post('defcon')
  async changeDefcon(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      return await this.commandService.changeDefcon(eventId, ChangeCommandDefconRequestSchema.parse(body), user);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'issues' in error &&
        Array.isArray(error.issues)
      ) {
        throw new BadRequestException('Invalid DEFCON change request');
      }
      throw error;
    }
  }

  @Get('operational-picture')
  async getOperationalPicture(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalPictureResponse> {
    return this.commandService.getOperationalPicture(eventId, user);
  }

  @Post('sitrep')
  async createSitrep(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<DocumentItem> {
    const dto = CreateSitrepRequestSchema.parse(body);
    return this.commandService.createSitrep(eventId, dto, user);
  }
}
