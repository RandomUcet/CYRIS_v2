import { Client, type ClientOptions, type SearchOptions, type SearchResult } from 'ldapts';
import type { ConnectionOptions } from 'node:tls';
import { createHash } from 'node:crypto';
import { resolveLdapTransportSecurity, validateLdapConfig, type LdapConfig } from '@cyris/contracts';

export interface LdapConnection {
  startTLS(options: ConnectionOptions): Promise<void>;
  bind(dn: string, password: string): Promise<void>;
  search(baseDn: string, options: SearchOptions): Promise<SearchResult>;
  unbind(): Promise<void>;
}

export type LdapClientFactory = (options: ClientOptions) => LdapConnection;
const verifiedTls: ConnectionOptions = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };

/** Both directory and user binds pass through this TLS-before-credentials boundary. */
export async function withLdapConnection<T>(
  config: LdapConfig,
  operation: (client: LdapConnection) => Promise<T>,
  createClient: LdapClientFactory = (options) => new Client(options),
): Promise<T> {
  const errors = validateLdapConfig(config);
  if (errors.length) throw new Error(errors.join('; '));
  const transport = resolveLdapTransportSecurity(config);
  const client = createClient({
    url: config.url, timeout: 5000, connectTimeout: 5000,
    // ldapts treats any constructor tlsOptions as immediate TLS, so StartTLS
    // options belong exclusively on the explicit upgrade below.
    ...(transport === 'LDAPS' ? { tlsOptions: { ...verifiedTls } } : {}),
  });
  try {
    if (transport === 'STARTTLS') await client.startTLS({ ...verifiedTls });
    return await operation(client);
  } finally {
    await client.unbind().catch(() => {});
  }
}

export function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

export function ldapIdentitySubject(providerId: string, dn: string): string {
  return `ldap:${providerId}:${createHash('sha256').update(dn.toLowerCase()).digest('hex')}`;
}

export async function authenticateDirectoryUser(
  config: LdapConfig,
  username: string,
  password: string,
  bindPassword: string,
  createClient?: LdapClientFactory,
): Promise<{ dn: string; email: string; displayName: string; groups: string[]; groupDns?: string[] } | null> {
  if (!username || !password || !bindPassword) return null;
  return withLdapConnection(config, async (client) => {
    await client.bind(config.bindDn, bindPassword);
    const safeUsername = escapeLdapFilter(username);
    const emailAttr = config.emailAttr || 'mail';
    const displayNameAttr = config.displayNameAttr || 'cn';
    const result = await client.search(config.baseDn, {
      scope: 'sub',
      filter: (config.userFilter || '(uid={username})').replaceAll('{username}', () => safeUsername),
      attributes: ['dn', config.usernameAttr || 'uid', emailAttr, displayNameAttr],
      sizeLimit: 2,
    });
    // Ambiguous directory matches must never select whichever entry arrived first.
    if (result.searchEntries.length !== 1) return null;
    const entry = result.searchEntries[0];
    if (!entry.dn || typeof entry[emailAttr] !== 'string' || !(entry[emailAttr] as string).includes('@')) return null;
    await withLdapConnection(config, (userClient) => userClient.bind(entry.dn, password), createClient);
    const groups: string[] = [];
    const groupDns: string[] = [];
    if (config.groupBaseDn) {
      const safeDn = escapeLdapFilter(entry.dn);
      const groupFilter = (config.groupFilter || '(|(member={dn})(memberUid={username}))')
        .replace(/\{dn\}|\{username\}/g, token => token === '{dn}' ? safeDn : safeUsername);
      const result = await client.search(config.groupBaseDn, { scope: 'sub', filter: groupFilter, attributes: ['cn'] });
      for (const group of result.searchEntries) {
        if (typeof group.dn === 'string') groupDns.push(group.dn);
        const names = Array.isArray(group.cn) ? group.cn : [group.cn];
        for (const name of names) if (typeof name === 'string') groups.push(name);
      }
    }
    return {
      dn: entry.dn,
      email: (entry[emailAttr] as string).trim().toLowerCase(),
      displayName: typeof entry[displayNameAttr] === 'string' ? entry[displayNameAttr] as string : username,
      groups,
      groupDns,
    };
  }, createClient);
}
