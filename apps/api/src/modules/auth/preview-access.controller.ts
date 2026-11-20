import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { previewTeamAccounts } from '@cyris/db';
import { Permissions } from '@cyris/shared';
import { AuthGuard } from './guards/auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthenticatedUser } from './session.service.js';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';

@Controller('auth/team-preview')
export class PreviewAccessController {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService) {}

  @Get()
  async status() {
    const [row] = await this.database.client.select({ enabled: previewTeamAccounts.enabled })
      .from(previewTeamAccounts).where(eq(previewTeamAccounts.enabled, true)).limit(1);
    return { enabled: Boolean(row) };
  }

  @Patch()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission(Permissions.PLATFORM_MANAGE)
  async update(@Body() body: { enabled?: unknown }, @CurrentUser() user: AuthenticatedUser) {
    const enabled = body?.enabled;
    if (typeof enabled !== 'boolean') throw new BadRequestException('Expected a boolean enabled flag.');
    return this.database.client.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cyris-team-preview'))`);
      const [account] = await tx.select({ id: previewTeamAccounts.userId }).from(previewTeamAccounts).limit(1);
      if (!account) throw new BadRequestException('Nejprve vytvořte zkušební účty příkazem pnpm teams:setup.');
      const changed = await tx.update(previewTeamAccounts).set({ enabled, generation: sql`gen_random_uuid()` })
        .where(eq(previewTeamAccounts.enabled, !enabled)).returning({ id: previewTeamAccounts.userId });
      if (changed.length) await this.audit.record({ actorUserId: user.id, category: 'auth', action: 'auth.team_preview.changed',
        metadata: { enabled, accountCount: changed.length }, txClient: tx });
      return { enabled };
    });
  }
}
