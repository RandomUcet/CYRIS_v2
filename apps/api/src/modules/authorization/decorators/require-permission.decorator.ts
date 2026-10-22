import { SetMetadata } from '@nestjs/common';
import type { PermissionKey, PermissionScope } from '@cyris/shared';

export const PERMISSION_CHECK_KEY = 'cyris:permission_check';

export interface PermissionRequirement {
  permission: PermissionKey;
  scope?: PermissionScope;
}

export const RequirePermission = (permission: PermissionKey, scope?: PermissionScope) =>
  SetMetadata(PERMISSION_CHECK_KEY, { permission, scope });
