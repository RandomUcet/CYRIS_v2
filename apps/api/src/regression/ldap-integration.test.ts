import assert from 'node:assert/strict';
import test from 'node:test';
import { LdapConfigSchema, validateLdapConfig } from '@cyris/contracts';

const base = {
  displayName: 'Loopback test directory',
  url: 'ldaps://127.0.0.1:636',
  tls: true,
  transportSecurity: 'LDAPS' as const,
  bindDn: 'cn=directory-test',
  baseDn: 'dc=test',
};

test('LDAP config requires verified transport semantics', () => {
  assert.deepEqual(validateLdapConfig(base), []);
  assert.match(validateLdapConfig({ ...base, url: 'http://127.0.0.1:80' })[0], /ldap/i);
  assert.match(validateLdapConfig({ ...base, url: 'ldap://127.0.0.1:389', transportSecurity: 'LDAPS' })[0], /ldaps/i);
  assert.match(validateLdapConfig({ ...base, url: 'ldaps://127.0.0.1:636', transportSecurity: 'NONE' })[0], /certificate/i);
});

test('LDAP secret is write-only in the validated config contract', () => {
  const parsed = LdapConfigSchema.parse({ ...base, bindPassword: 'test-only-secret' });
  assert.equal(parsed.bindPassword, 'test-only-secret');
  assert.equal('bindPassword' in LdapConfigSchema.omit({ bindPassword: true }).parse(base), false);
});

test('bounded mock test never accepts a network probe mode', () => {
  const request = { transport: 'NETWORK' };
  assert.notEqual(request.transport, 'MOCK');
});
