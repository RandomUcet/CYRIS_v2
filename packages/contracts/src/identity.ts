import { z } from 'zod';

export const LdapGroupMappingSchema = z.object({
  ldapGroup: z.string().trim().min(1).max(2048),
  roleSlug: z.string().trim().min(1).max(128),
  eventId: z.string().uuid().optional(),
  unitSlug: z.string().trim().max(128).optional(),
});

export type LdapGroupMapping = z.infer<typeof LdapGroupMappingSchema>;

export const LdapTeamAssignmentSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('DIRECTORY') }).strict(),
  z.object({ mode: z.literal('MANUAL'), unitId: z.string().uuid(), roleId: z.string().uuid() }).strict(),
  z.object({ mode: z.literal('UNASSIGNED') }).strict(),
]);
export type LdapTeamAssignment = z.infer<typeof LdapTeamAssignmentSchema>;

export const LdapTeamAccountQuerySchema = z.object({
  eventId: z.string().uuid(),
  q: z.string().trim().max(160).optional(),
  unassigned: z.enum(['true', 'false']).optional(),
});

export interface LdapTeamAccount {
  identityId: string;
  userId: string;
  email: string;
  displayName: string;
  providerName: string;
  membershipStatus: 'ACTIVE' | 'INACTIVE' | null;
  units: { id: string; name: string }[];
  assignment: LdapTeamAssignment;
}

export const LdapConfigSchema = z.object({
  displayName: z.string().min(1).max(128),
  url: z.string().min(1).max(255), // ldap:// or ldaps://
  tls: z.boolean().default(false),
  // Optional so existing tls/url configurations retain their secure semantics.
  transportSecurity: z.enum(['NONE', 'LDAPS', 'STARTTLS']).optional(),
  bindDn: z.string().min(1).max(255),
  bindPassword: z.string().optional(), // write-only, redacted on responses
  baseDn: z.string().min(1).max(255),
  userFilter: z.string().min(1).max(255).default('(uid={username})'),
  usernameAttr: z.string().min(1).max(64).default('uid'),
  emailAttr: z.string().min(1).max(64).default('mail'),
  displayNameAttr: z.string().min(1).max(64).default('cn'),
  groupBaseDn: z.string().max(255).optional().nullable(),
  groupFilter: z.string().max(255).optional().nullable(),
  jitEnabled: z.boolean().default(true),
  groupMappings: z.array(LdapGroupMappingSchema).default([]),
});

export type LdapConfig = z.input<typeof LdapConfigSchema>;

export type LdapTransportSecurity = 'NONE' | 'LDAPS' | 'STARTTLS';

export function resolveLdapTransportSecurity(config: Pick<LdapConfig, 'url' | 'tls' | 'transportSecurity'>): LdapTransportSecurity {
  if (config.transportSecurity) return config.transportSecurity;
  if (config.url.toLowerCase().startsWith('ldaps://')) return 'LDAPS';
  return config.tls ? 'STARTTLS' : 'NONE';
}

export function validateLdapConfig(config: unknown): string[] {
  const parsed = LdapConfigSchema.safeParse(config);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  const value = parsed.data;
  const errors: string[] = [];
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    return ['LDAP endpoint must be a valid URL'];
  }
  if (url.protocol !== 'ldap:' && url.protocol !== 'ldaps:') errors.push('LDAP endpoint must use ldap:// or ldaps://');
  if (!url.hostname) errors.push('LDAP endpoint hostname is required');
  if (url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) {
    errors.push('LDAP endpoint must contain only protocol, hostname and optional port');
  }
  const security = resolveLdapTransportSecurity(value);
  if (security === 'LDAPS' && url.protocol !== 'ldaps:') errors.push('LDAPS security requires an ldaps:// endpoint');
  if (security === 'STARTTLS' && url.protocol !== 'ldap:') errors.push('StartTLS security requires an ldap:// endpoint');
  if (security === 'NONE') {
    if (url.protocol === 'ldaps:' || value.tls) errors.push('TLS cannot be disabled by a conflicting transport setting');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) errors.push('Plain LDAP is allowed only for loopback testing; use LDAPS or StartTLS');
  }
  if (!value.userFilter.includes('{username}')) errors.push('LDAP user filter must contain {username}');
  if (value.groupMappings.length && !value.groupBaseDn) errors.push('LDAP group mappings require a group base DN');
  if (value.groupFilter && !value.groupFilter.includes('{dn}') && !value.groupFilter.includes('{username}')) errors.push('LDAP group filter must identify the authenticated user');
  return errors;
}

export const OidcConfigSchema = z.object({
  displayName: z.string().min(1).max(128),
  issuerUrl: z.string().url(),
  clientId: z.string().min(1).max(255),
  clientSecret: z.string().optional(), // write-only, redacted on responses
  scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
  allowedEmailDomains: z.array(z.string()).default([]),
  claimMappings: z
    .object({
      email: z.string().default('email'),
      displayName: z.string().default('name'),
      subject: z.string().default('sub'),
    })
    .default({ email: 'email', displayName: 'name', subject: 'sub' }),
  jitEnabled: z.boolean().default(true),
});

export type OidcConfig = z.infer<typeof OidcConfigSchema>;

export const IdentityProviderSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.enum(['LDAP', 'OIDC']),
  enabled: z.boolean(),
  status: z.string(),
  config: z.record(z.any()),
  hasSecretConfigured: z.boolean().default(false),
  lastCheckedAt: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IdentityProviderSummary = z.infer<typeof IdentityProviderSummarySchema>;

export const SaveIdentityProviderSchema = z.object({
  name: z.string().min(1).max(128),
  category: z.enum(['LDAP', 'OIDC']),
  enabled: z.boolean().default(true),
  config: z.record(z.any()),
  secret: z.string().optional(), // e.g. bindPassword for LDAP, clientSecret for OIDC
});

export type SaveIdentityProviderInput = z.infer<typeof SaveIdentityProviderSchema>;

export const LdapAuthRequestSchema = z.object({
  providerId: z.string().uuid().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
});

export type LdapAuthRequest = z.infer<typeof LdapAuthRequestSchema>;

export const OidcAuthorizeUrlResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  state: z.string(),
});

export type OidcAuthorizeUrlResponse = z.infer<typeof OidcAuthorizeUrlResponseSchema>;

export const PlatformAdminSearchSchema = z.string().trim().max(160);
export const PlatformAdminChangeSchema = z.object({ enabled: z.boolean() }).strict();

export interface PlatformAdminAccount {
  id: string;
  displayName: string;
  email: string;
  status: string;
  ldap: boolean;
  admin: boolean;
}
