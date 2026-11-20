import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { LdapConfigSchema, resolveLdapTransportSecurity, validateLdapConfig, type LdapConfig } from '@cyris/contracts';
import { decryptSecret } from '@cyris/shared';
import { authenticateDirectoryUser, escapeLdapFilter, ldapIdentitySubject, type LdapClientFactory } from '../modules/auth/providers/ldap-directory.js';
import { LdapIdentityProvider } from '../modules/auth/providers/ldap-identity.provider.js';
import { IdentityService } from '../modules/integrations/identity.service.js';
import { IntegrationSecretService } from '../modules/integrations/integration-secret.service.js';

const base: LdapConfig = {
  displayName: 'Test directory', url: 'ldap://directory.test:389', tls: true,
  transportSecurity: 'STARTTLS', bindDn: 'cn=service', baseDn: 'dc=test',
};

test('legacy LDAP TLS stays secure; conflicting downgrade and malformed endpoints are rejected', () => {
  const { transportSecurity: _, ...legacy } = base;
  assert.equal(resolveLdapTransportSecurity(LdapConfigSchema.parse(legacy)), 'STARTTLS');
  assert.equal(resolveLdapTransportSecurity({ ...legacy, url: 'ldaps://directory.test', tls: false }), 'LDAPS');
  assert.deepEqual(validateLdapConfig(base), []);
  for (const config of [
    { ...base, url: 'http://directory.test' },
    { ...base, url: 'ldap://user:secret@directory.test' },
    { ...base, url: 'ldap://directory.test/path' },
    { ...base, transportSecurity: 'NONE' },
    { ...base, tls: false, transportSecurity: 'NONE' },
    { ...base, transportSecurity: 'LDAPS' },
    { ...base, userFilter: '(uid=everybody)' },
    { ...base, groupMappings: [{ ldapGroup: 'staff', roleSlug: 'participant', unitSlug: 'lab' }] },
    { ...base, groupFilter: '(cn=admin)' },
    null,
  ]) assert.ok(validateLdapConfig(config).length, JSON.stringify(config));
  assert.deepEqual(validateLdapConfig({ ...base, url: 'ldap://127.0.0.1:389', tls: false, transportSecurity: 'NONE' }), []);
});

function directory(options: { failTls?: number; ambiguous?: boolean; failUser?: boolean } = {}) {
  const calls: Array<{ client: number; operation: string; value?: unknown }> = [];
  let counter = 0;
  const factory: LdapClientFactory = (clientOptions) => {
    const id = ++counter;
    calls.push({ client: id, operation: 'create', value: clientOptions });
    return {
      async startTLS(value) { calls.push({ client: id, operation: 'tls', value }); if (options.failTls === id) throw new Error('certificate rejected'); },
      async bind(dn, password) { calls.push({ client: id, operation: 'bind', value: { dn, password } }); if (id === 2 && options.failUser) throw new Error('invalid credentials'); },
      async search(_base, value) {
        calls.push({ client: id, operation: 'search', value });
        const entry = { dn: 'cn=Some(One),dc=test', mail: 'operator@example.test', cn: 'Operator' };
        return { searchEntries: options.ambiguous ? [entry, { ...entry, dn: 'cn=Other,dc=test' }] : [entry], searchReferences: [] };
      },
      async unbind() { calls.push({ client: id, operation: 'unbind' }); },
    };
  };
  return { calls, factory };
}

test('StartTLS precedes service and user credentials; both connections always close', async () => {
  const { calls, factory } = directory();
  const user = await authenticateDirectoryUser(base, 'operator', ' user-password ', ' service-password ', factory);
  assert.equal(user?.email, 'operator@example.test');
  assert.deepEqual(calls.map((call) => `${call.client}:${call.operation}`), [
    '1:create', '1:tls', '1:bind', '1:search', '2:create', '2:tls', '2:bind', '2:unbind', '1:unbind',
  ]);
  for (const call of calls.filter((call) => call.operation === 'create')) assert.equal('tlsOptions' in (call.value as object), false);
  for (const call of calls.filter((call) => call.operation === 'tls')) assert.equal((call.value as any).rejectUnauthorized, true);
  assert.equal((calls.find((call) => call.client === 2 && call.operation === 'bind')!.value as any).password, ' user-password ');
});

test('TLS rejection never sends credentials, including the separate user bind', async () => {
  for (const failedClient of [1, 2]) {
    const { calls, factory } = directory({ failTls: failedClient });
    await assert.rejects(authenticateDirectoryUser(base, 'operator', 'password', 'service-password', factory), /certificate/);
    assert.equal(calls.some((call) => call.client === failedClient && call.operation === 'bind'), false);
    assert.equal(calls.filter((call) => call.operation === 'unbind').length, failedClient);
  }
});

test('LDAPS uses verified immediate TLS without StartTLS', async () => {
  const { calls, factory } = directory();
  await authenticateDirectoryUser({ ...base, url: 'ldaps://directory.test:636', transportSecurity: 'LDAPS' }, 'operator', 'password', 'service-password', factory);
  assert.equal(calls.some((call) => call.operation === 'tls'), false);
  for (const call of calls.filter((call) => call.operation === 'create')) assert.equal((call.value as any).tlsOptions.rejectUnauthorized, true);
});

test('group search records full directory object DNs and all CNs from the configured group base', async () => {
  const requests: Array<[string, string | undefined]> = [];
  const factory: LdapClientFactory = () => ({
    async bind() {}, async startTLS() {}, async unbind() {},
    async search(baseDn, options) {
      requests.push([baseDn, options.filter?.toString()]);
      return { searchReferences: [], searchEntries: baseDn === 'ou=groups,dc=test'
        ? [{ dn: 'cn=Blue,ou=groups,dc=test', cn: ['Blue', 'Team Blue'] }]
        : [{ dn: 'cn=Operator,dc=test', cn: 'Operator', mail: 'operator@example.test' }] };
    },
  });
  const user = await authenticateDirectoryUser({ ...base, groupBaseDn: 'ou=groups,dc=test' },
    'operator', 'secret', 'bind', factory);
  assert.deepEqual(user?.groups, ['Blue', 'Team Blue']);
  assert.deepEqual(user?.groupDns, ['cn=Blue,ou=groups,dc=test']);
  assert.deepEqual(requests[1], ['ou=groups,dc=test', '(|(member=cn=Operator,dc=test)(memberUid=operator))']);
});

test('ambiguous results and missing service secret cannot authenticate; invalid user bind closes connections', async () => {
  const ambiguous = directory({ ambiguous: true });
  assert.equal(await authenticateDirectoryUser(base, 'operator', 'password', 'service-password', ambiguous.factory), null);
  assert.equal(ambiguous.calls.some((call) => call.client === 2), false);
  const missing = directory();
  assert.equal(await authenticateDirectoryUser(base, 'operator', 'password', '', missing.factory), null);
  assert.deepEqual(missing.calls, []);
  const invalid = directory({ failUser: true });
  await assert.rejects(authenticateDirectoryUser(base, 'operator', 'bad-password', 'service-password', invalid.factory));
  assert.equal(invalid.calls.filter((call) => call.operation === 'unbind').length, 2);
});

test('filters escape NUL and DN metacharacters; subjects are namespaced and bounded', () => {
  assert.equal(escapeLdapFilter('a\0*(b)\\'), 'a\\00\\2a\\28b\\29\\5c');
  const dn = 'cn=' + 'x'.repeat(300);
  assert.notEqual(ldapIdentitySubject('provider-a', dn), ldapIdentitySubject('provider-b', dn));
  assert.equal(ldapIdentitySubject('provider-a', dn), ldapIdentitySubject('provider-a', dn.toUpperCase()));
  assert.ok(ldapIdentitySubject('provider-a', dn).length <= 255);
});

function fakeDb(rows: unknown[][]) {
  const writes: unknown[] = [];
  const db: any = {
    select() {
      const chain: any = {};
      for (const method of ['from', 'where', 'innerJoin', 'limit', 'for']) chain[method] = () => chain;
      chain.then = (resolve: (value: unknown[]) => void) => resolve(rows.shift() ?? []);
      return chain;
    },
    insert() { writes.push('insert'); throw new Error('Unexpected insert'); },
    update() { writes.push('update'); throw new Error('Unexpected update'); },
    delete() { writes.push('delete'); throw new Error('Unexpected delete'); },
    transaction(fn: (tx: any) => unknown) { return fn(db); },
    execute: async () => [], // first-login transaction lock
  };
  return { db, writes };
}

test('JIT cannot take over a local account by claiming its email address', async () => {
  const { db, writes } = fakeDb([[{ id: 'provider-a', config: base }], [{ config: base }], [], [{ id: 'local-admin' }]]);
  class TestProvider extends LdapIdentityProvider {
    protected override async authenticateDirectory() { return { dn: 'cn=operator', email: 'admin@example.test', displayName: 'Operator', groups: [] }; }
  }
  const provider = new TestProvider({ client: db } as any, { getSecret: async () => 'service-password' } as any);
  assert.equal(await provider.authenticate({ username: 'operator', password: 'password' }), null);
  assert.deepEqual(writes, []);
});

test('identity provider operations reject unrelated integrations before mutation', async () => {
  for (const operation of ['get', 'toggle', 'delete', 'ldap', 'oidc']) {
    const { db, writes } = fakeDb([[{ id: 'ai-provider', category: 'AI_PROVIDER' }]]);
    const service = new IdentityService({ client: db } as any, {} as any, {} as any);
    await assert.rejects(async () => {
      if (operation === 'get') return service.getProvider('ai-provider');
      if (operation === 'toggle') return service.toggleProvider('ai-provider', false);
      if (operation === 'delete') return service.deleteProvider('ai-provider');
      if (operation === 'ldap') return service.saveLdapProvider('ai-provider', 'LDAP', base);
      return service.saveOidcProvider('ai-provider', 'OIDC', { displayName: 'Test', issuerUrl: 'https://identity.example.test', clientId: 'client', scopes: ['openid'], allowedEmailDomains: [], claimMappings: { email: 'email', displayName: 'name', subject: 'sub' }, jitEnabled: true });
    }, /not found/);
    assert.deepEqual(writes, []);
  }
});

test('configuration validation requires a secret and never claims network verification', async () => {
  const provider = { id: 'provider-a', category: 'LDAP', config: base, hasSecretConfigured: true };
  const service = new IdentityService({} as any, {} as any, {} as any);
  service.getProvider = async () => provider as any;
  const result = await service.testLdapProvider('provider-a');
  assert.equal(result.mode, 'CONFIGURATION');
  assert.equal(result.networkChecked, false);
  assert.equal('certificateVerification' in result, false);
  await assert.rejects(service.testLdapProvider('provider-a', 'NETWORK' as any));
  provider.hasSecretConfigured = false;
  await assert.rejects(service.testLdapProvider('provider-a'), /bind password/);
});

test('encrypted integration secrets preserve leading and trailing whitespace exactly', async () => {
  let stored: any;
  const db = { insert: () => ({ values: (value: unknown) => { stored = value; return { onConflictDoUpdate: async () => {} }; } }) };
  const key = Buffer.alloc(32, 7);
  const service = new IntegrationSecretService({ client: db } as any, { values: { CYRIS_MASTER_KEY: key.toString('hex') } } as any, { record: async () => {} } as any);
  service.onModuleInit();
  await service.setSecret('provider-a', 'BIND_PASSWORD', ' leading and trailing \t');
  assert.equal(decryptSecret(stored, key), ' leading and trailing \t');
  assert.equal(JSON.stringify(stored).includes('leading and trailing'), false);
  await assert.rejects(service.setSecret('provider-a', 'BIND_PASSWORD', ''), /empty/);
});
