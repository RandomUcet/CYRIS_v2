// Run through stdin in the deployed API working directory, with provider name and username.
import 'reflect-metadata';
import { and, eq, or, sql, integrations, users, userIdentities, closeDatabaseConnection } from '@cyris/db';
import { validateLdapConfig } from '@cyris/contracts';
import { ConfigService } from './dist/modules/config/config.service.js';
import { DatabaseService } from './dist/modules/database/database.service.js';
import { IntegrationSecretService } from './dist/modules/integrations/integration-secret.service.js';
import { ldapIdentitySubject, escapeLdapFilter, withLdapConnection } from './dist/modules/auth/providers/ldap-directory.js';

const [providerName, username] = process.argv.slice(2);
let step = 'nastavení API';
function stop(message) {
  console.log('STOP:', message);
  process.exitCode = 1;
}
async function check() {
  if (!username || !providerName) return stop('Zadej název poskytovatele a přihlašovací jméno.');
  const settings = new ConfigService();
  const database = new DatabaseService(settings);
  const db = database.client;
  const providers = await db.select().from(integrations).where(and(
    eq(integrations.name, providerName), eq(integrations.category, 'LDAP'),
  )).limit(2);
  if (providers.length !== 1 || !providers[0].enabled) return stop('Zkontroluj název a zapnutí poskytovatele.');
  const { config, id } = providers[0];
  if (validateLdapConfig(config).length) return stop('Uložená konfigurace LDAP neprošla validací.');
  const url = new URL(config.url);
  if (url.protocol !== 'ldaps:') return stop('Tato kontrola vyžaduje poskytovatele s LDAPS.');
  console.log('LDAPS:', url.host, '| filtr:', config.userFilter, '| e-mail:', config.emailAttr || 'mail');
  step = 'načtení uloženého hesla servisního účtu';
  const secrets = new IntegrationSecretService(database, settings);
  secrets.onModuleInit();
  const bindPassword = await secrets.getSecret(id, 'BIND_PASSWORD');
  if (!bindPassword) return stop('Chybí uložené heslo servisního účtu.');
  step = 'LDAPS nebo přihlášení servisního účtu (Bind DN)';
  await withLdapConnection(config, async client => {
    await client.bind(config.bindDn, bindPassword);
    console.log('OK: LDAPS a přihlášení servisního účtu');
    step = 'vyhledání uživatele';
    const emailAttr = config.emailAttr || 'mail';
    const escaped = escapeLdapFilter(username);
    const result = await client.search(config.baseDn, {
      scope: 'sub', sizeLimit: 2, filter: config.userFilter.replaceAll('{username}', () => escaped),
      attributes: ['dn', emailAttr],
    });
    if (result.searchEntries.length !== 1) return stop('Počet nalezených účtů: ' + result.searchEntries.length + '. Zkontroluj Base DN a filtr.');
    const entry = result.searchEntries[0];
    const email = entry[emailAttr];
    if (typeof email !== 'string' || !email.includes('@')) return stop('Účet nalezen, atribut ' + emailAttr + ' neobsahuje použitelný e-mail.');
    console.log('OK: nalezen jeden účet s e-mailem');
    if (config.groupBaseDn) {
      step = 'vyhledání skupin';
      const filter = (config.groupFilter || '(|(member={dn})(memberUid={username}))')
        .replace(/\{dn\}|\{username\}/g, token => token === '{dn}' ? escapeLdapFilter(entry.dn) : escaped);
      await client.search(config.groupBaseDn, {scope: 'sub', filter, attributes: ['cn']});
      console.log('OK: dotaz na skupiny');
    }
    step = 'kontrola identity v CYRIS';
    const [linked] = await db.select({status: users.status}).from(userIdentities)
      .innerJoin(users, eq(users.id, userIdentities.userId))
      .where(and(eq(userIdentities.providerType, 'LDAP'), or(
        eq(userIdentities.providerSubject, ldapIdentitySubject(id, entry.dn)),
        and(eq(userIdentities.providerSubject, entry.dn.toLowerCase()), sql`${userIdentities.metadata}->>'providerId' = ${id}`),
      ))).limit(1);
    if (linked && linked.status !== 'ACTIVE') return stop('Propojený účet není v CYRIS aktivní.');
    if (!linked) {
      if (config.jitEnabled === false) return stop('První přihlášení vyžaduje povolené JIT.');
      const [conflict] = await db.select({id: users.id}).from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
      if (conflict) return stop('Tento e-mail už v CYRIS patří jinému účtu. Automatické propojení je zablokované.');
    }
    console.log('OK: kontrolované podmínky prošly. Heslo uživatele a zápis přihlášení nebyly testovány.');
  });
}
try { await check(); } catch (error) {
  // Directory messages may include user data. Emit only the LDAP/TLS error class and code.
  console.log('STOP:', step, '|', error.name, error.code ?? '');
  process.exitCode = 1;
} finally { await closeDatabaseConnection(); }
