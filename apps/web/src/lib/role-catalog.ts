import type {RolePermissionEntry} from '@cyris/contracts';
const scopeOrder=['PLATFORM','EVENT','UNIT','OWN','ASSIGNED'] as const;
/** Display only scopes actually granted by the event-specific role. */
export function roleScopes(entries:readonly RolePermissionEntry[]|null|undefined):string[]{
  const present=new Set((entries??[]).map(entry=>entry.scope));
  return scopeOrder.filter(scope=>present.has(scope));
}
/** Search and count real atomic permissions; never substitute a guessed standard role. */
export function rolePermissionKeys(entries:readonly RolePermissionEntry[]|null|undefined):string[]{
  return Array.from(new Set((entries??[]).map(entry=>entry.permissionKey))).sort();
}
