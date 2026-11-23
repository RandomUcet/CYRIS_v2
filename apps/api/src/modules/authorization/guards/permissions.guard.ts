import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CyrisRequest } from '../../auth/guards/auth.guard.js';
import {
  PERMISSION_CHECK_KEY,
  type PermissionRequirement,
} from '../decorators/require-permission.decorator.js';
import { AuthorizationService } from '../authorization.service.js';
import { AuditService } from '../../audit/audit.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authzService: AuthorizationService,
    private readonly auditService: AuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
      PERMISSION_CHECK_KEY,
      [context.getHandler(), context.getClass()]
    );

    // If no permission metadata is set, allow route through (guarded by AuthGuard if present)
    if (!requirement) {
      return true;
    }

    const req = context.switchToHttp().getRequest<CyrisRequest>();
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }

    const params = req.params as Record<string, string | undefined>;
    const eventId = params?.eventId;
    const unitId = params?.unitId;

    const isAllowed = await this.authzService.authorize({
      user: req.user,
      permission: requirement.permission,
      context: {
        eventId,
        unitId,
      },
    });

    if (!isAllowed) {
      // Use the socket identity, not user-supplied forwarding metadata.
      const clientIp = req.ip || 'unknown';
      const userAgent = (req.headers['user-agent'] as string) || null;
      const requestId = req.id || null;

      await this.auditService.record({
        action: 'authorization.denied',
        category: 'authorization',
        actorUserId: req.viewAs?.actorUserId ?? req.user.id,
        actorType: 'USER',
        eventId: eventId || null,
        resourceType: 'permission',
        resourceId: requirement.permission,
        outcome: 'DENIED',
        ipAddress: clientIp,
        userAgent,
        requestId,
        metadata: {
          permission: requirement.permission,
          scope: requirement.scope,
          context: { eventId, unitId },
          ...(req.viewAs ? { previewId: req.viewAs.id, targetUserId: req.user.id } : {}),
        },
      });

      throw new ForbiddenException(
        `Forbidden: Missing permission '${requirement.permission}' for the requested resource.`
      );
    }

    return true;
  }
}
