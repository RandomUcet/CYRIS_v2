import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { IdentityService } from './identity.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { Permissions } from '@cyris/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';

@Controller('admin/settings/identity')
@UseGuards(AuthGuard, PermissionsGuard)
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  @RequirePermission(Permissions.PLATFORM_MANAGE)
  async listProviders() {
    return this.identityService.listProviders();
  }

  @Post('ldap')
  @RequirePermission(Permissions.PLATFORM_MANAGE)
  async saveLdapProvider(
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser
  ) {
    if (!body?.name || !body?.config) {
      throw new BadRequestException('Provider name and configuration are required');
    }
    return this.identityService.saveLdapProvider(
      body.id,
      body.name,
      body.config,
      body.bindPassword,
      user.id
    );
  }

  @Post('oidc')
  @RequirePermission(Permissions.PLATFORM_MANAGE)
  async saveOidcProvider(
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser
  ) {
    if (!body?.name || !body?.config) {
      throw new BadRequestException('Provider name and configuration are required');
    }
    return this.identityService.saveOidcProvider(
      body.id,
      body.name,
      body.config,
      body.clientSecret,
      user.id
    );
  }

  @Patch(':id/toggle')
  @RequirePermission(Permissions.PLATFORM_MANAGE)
  async toggleProvider(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.identityService.toggleProvider(id, Boolean(body.enabled), user.id);
  }

  @Delete(':id')
  @RequirePermission(Permissions.PLATFORM_MANAGE)
  async deleteProvider(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    await this.identityService.deleteProvider(id, user.id);
    return { success: true };
  }
}
