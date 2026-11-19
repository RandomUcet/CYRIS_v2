import { z } from 'zod';

export const LdapGroupMappingSchema = z.object({
  ldapGroup: z.string().min(1),
  roleSlug: z.string().min(1),
  unitSlug: z.string().optional(),
});

export type LdapGroupMapping = z.infer<typeof LdapGroupMappingSchema>;

export const LdapConfigSchema = z.object({
  displayName: z.string().min(1).max(128),
  url: z.string().min(1).max(255), // ldap:// or ldaps://
  tls: z.boolean().default(false),
  transportSecurity: z.enum(['NONE', 'LDAPS', 'STARTTLS']).default('NONE'),
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

export function validateLdapConfig(config: Pick<LdapConfig, 'url' | 'tls' | 'transportSecurity'>): string[] {
  const errors: string[] = [];
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    return ['LDAP endpoint must be a valid URL'];
  }
  if (url.protocol !== 'ldap:' && url.protocol !== 'ldaps:') {
    errors.push('LDAP endpoint must use ldap:// or ldaps://');
  }
  const security = config.transportSecurity ?? (config.tls ? 'LDAPS' : 'NONE');
  if (security === 'LDAPS' && url.protocol !== 'ldaps:') {
    errors.push('LDAPS security requires an ldaps:// endpoint');
  }
  if (security === 'STARTTLS' && url.protocol !== 'ldap:') {
    errors.push('StartTLS security requires an ldap:// endpoint');
  }
  if (security === 'NONE' && url.protocol === 'ldaps:') {
    errors.push('ldaps:// cannot be configured without certificate verification');
  }
  if (!url.hostname) errors.push('LDAP endpoint hostname is required');
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
