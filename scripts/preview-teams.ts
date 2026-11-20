import { randomBytes, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { previewTeams, previewTeamEmail } from '@cyris/contracts';
import { closeDatabaseConnection, getDbClient } from '@cyris/db';
import { provisionTeamPreview, type PreviewCredentials } from './team-preview-bootstrap.js';

const directory = '.cyris-preview';
const file = join(directory, 'teams.json');
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
async function readCredentials(): Promise<PreviewCredentials> {
  const credentials = JSON.parse(await readFile(file, 'utf8')) as PreviewCredentials;
  if (!uuid.test(credentials?.eventId)) throw new Error('Neplatný místní identifikátor cvičení.');
  for (const team of previewTeams) {
    const account = credentials.accounts?.[team.login];
    if (!account || !uuid.test(account.id) || typeof account.password !== 'string' || account.password.length < 24) {
      throw new Error(`Neplatný místní účet: ${team.name}`);
    }
  }
  return credentials;
}

async function createCredentials() {
  try { return await readCredentials(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = join(directory, randomUUID());
  const accounts = Object.fromEntries(previewTeams.map(({ login }) =>
    [login, { id: randomUUID(), password: randomBytes(24).toString('base64url') }]));
  await writeFile(temp, JSON.stringify({ eventId: randomUUID(), accounts }), { flag: 'wx', mode: 0o600 });
  try {
    // Publish a complete private file atomically, also when two starts race.
    await link(temp, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  } finally { await unlink(temp); }
  return readCredentials();
}

async function main() {
  if (process.argv.includes('--list')) {
    const { accounts } = await readCredentials().catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('V tomto adresáři zatím nejsou týmová hesla. Spusťte CYRIS_TEAM_PREVIEW=1 pnpm dev a počkejte na přípravu týmů.');
      }
      throw error;
    });
    for (const { name, login } of previewTeams) {
      console.log(`${name}\n  ${previewTeamEmail(login)}  ${accounts[login]!.password}\n`);
    }
    return;
  }
  const db = getDbClient();
  if (process.env.NODE_ENV === 'production') throw new Error('Zkušební účty jsou určeny pro místní vývoj.');
  await provisionTeamPreview(db, await createCredentials());
  console.log('[CYRIS] Zkouška sedmi týmů je připravena. Místní přihlašovací údaje zobrazíte příkazem pnpm teams:list.');
}

main().catch(error => {
  // Database error details may contain private identity material. Log only a concise diagnostic.
  console.error('[CYRIS]', error?.code === '23505' ? 'Kolize existujícího účtu nebo cvičení.' : error?.message?.split('\n')[0]);
  process.exitCode = 1;
}).finally(closeDatabaseConnection);
