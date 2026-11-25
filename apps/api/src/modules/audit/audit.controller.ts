import { Controller, Get, Header, Param, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import {
  AuditQueryFiltersSchema,
  type AuditListResponse,
  type AuditEventItem,
} from '@cyris/contracts';

@Controller('audit')
@UseGuards(AuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService, private readonly authz: AuthorizationService) {}

  @Get()
  @Header('Cache-Control','private, no-store')
  @RequirePermission(Permissions.AUDIT_READ, PermissionScopes.PLATFORM)
  async list(@Query() query: Record<string, string>, @CurrentUser() user: AuthenticatedUser): Promise<AuditListResponse> {
    const filters = AuditQueryFiltersSchema.parse(query);
    return this.auditService.list(filters, await this.authz.authorize({ user, permission: Permissions.PLATFORM_MANAGE }));
  }

  @Get(':auditEventId')
  @Header('Cache-Control','private, no-store')
  @RequirePermission(Permissions.AUDIT_READ, PermissionScopes.PLATFORM)
  async getById(@Param('auditEventId') auditEventId: string, @CurrentUser() user: AuthenticatedUser): Promise<AuditEventItem> {
    const item = await this.auditService.getById(auditEventId, await this.authz.authorize({ user, permission: Permissions.PLATFORM_MANAGE }));
    if (!item) {
      throw new NotFoundException(`Audit event '${auditEventId}' not found.`);
    }
    return item;
  }
}
