import { BadRequestException } from '@nestjs/common';
import { Permissions } from '@cyris/shared';

export function validateEventRolePermissions(permissions: Array<{ permissionKey: string; scope: string }>): void {
  const known = new Set<string>(Object.values(Permissions));
  const platformOnly = new Set<string>([
    Permissions.PLATFORM_MANAGE, Permissions.EVENT_CREATE,
    Permissions.IDENTITY_MANAGE, Permissions.INTEGRATION_MANAGE,
  ]);
  const scopes = new Set<string>(['EVENT', 'UNIT', 'OWN', 'ASSIGNED']);
  const seen = new Set<string>();
  for (const permission of permissions) {
    if (!known.has(permission.permissionKey) || platformOnly.has(permission.permissionKey) || !scopes.has(permission.scope)) {
      throw new BadRequestException('Event roles may contain only known event permissions with an event, unit, own or assigned scope');
    }
    const key = `${permission.permissionKey}:${permission.scope}`;
    if (seen.has(key)) throw new BadRequestException('Duplicate role permission');
    seen.add(key);
  }
}
