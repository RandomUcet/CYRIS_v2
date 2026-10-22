import { Controller, Get, Param, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service.js';
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
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission(Permissions.AUDIT_READ, PermissionScopes.PLATFORM)
  async list(@Query() query: Record<string, string>): Promise<AuditListResponse> {
    const filters = AuditQueryFiltersSchema.parse(query);
    return this.auditService.list(filters);
  }

  @Get(':auditEventId')
  @RequirePermission(Permissions.AUDIT_READ, PermissionScopes.PLATFORM)
  async getById(@Param('auditEventId') auditEventId: string): Promise<AuditEventItem> {
    const item = await this.auditService.getById(auditEventId);
    if (!item) {
      throw new NotFoundException(`Audit event '${auditEventId}' not found.`);
    }
    return item;
  }
}
