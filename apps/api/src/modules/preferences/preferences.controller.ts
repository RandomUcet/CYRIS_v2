import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PreferencesService } from './preferences.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  UpdateUserPreferencesSchema,
  type UserPreferences,
} from '@cyris/contracts';

@Controller('preferences')
@UseGuards(AuthGuard)
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get('me')
  async getMyPreferences(@CurrentUser() user: AuthenticatedUser): Promise<UserPreferences> {
    return this.preferencesService.getUserPreferences(user.id);
  }

  @Patch('me')
  async updateMyPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown
  ): Promise<UserPreferences> {
    const parse = UpdateUserPreferencesSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid preferences payload');
    }
    return this.preferencesService.updateUserPreferences(user.id, parse.data);
  }
}
