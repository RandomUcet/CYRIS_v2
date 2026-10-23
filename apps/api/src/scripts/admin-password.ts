import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import * as argon2 from 'argon2';
import { Redis } from 'ioredis';
import { eq, and } from 'drizzle-orm';
import {
  getDbClient,
  closeDatabaseConnection,
  users,
  userIdentities,
  IdentityProviderType,
} from '@cyris/db';
import { loadConfig } from '@cyris/config';

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askSecret(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input,
      output,
      terminal: true,
    });

    output.write(query);

    let password = '';
    const onData = (charBuffer: Buffer) => {
      const char = charBuffer.toString('utf-8');
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl+D
          input.removeListener('data', onData);
          break;
        case '\u0003': // Ctrl+C
          input.removeListener('data', onData);
          process.exit(130);
          break;
        case '\u007f':
        case '\b': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
          break;
        default:
          password += char;
          break;
      }
    };

    input.on('data', onData);

    rl.question('', () => {
      rl.close();
      output.write('\n');
      resolve(password.trim());
    });
  });
}

async function main(): Promise<void> {
  console.log('================================================================');
  console.log('  CYRIS v2 — Operator Credential Management');
  console.log('================================================================\n');

  let email = process.env.CYRIS_OPERATOR_EMAIL || '';
  if (!email) {
    email = await askQuestion('Account Email: ');
  }
  if (!email || !email.includes('@')) {
    console.error('Error: A valid email address is required.');
    process.exit(1);
  }

  const db = getDbClient();

  const [targetUser] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!targetUser) {
    console.error(`Error: User with email '${email}' not found.`);
    await closeDatabaseConnection();
    process.exit(1);
  }

  let password = process.env.CYRIS_OPERATOR_PASSWORD || '';
  if (!password) {
    password = await askSecret('Enter new password: ');
    const confirmPassword = await askSecret('Confirm new password: ');

    if (!password || password.length < 8) {
      console.error('\nError: Password must be at least 8 characters long.');
      await closeDatabaseConnection();
      process.exit(1);
    }

    if (password !== confirmPassword) {
      console.error('\nError: Passwords do not match.');
      await closeDatabaseConnection();
      process.exit(1);
    }
  }

  console.log('\nHashing credentials with Argon2id...');
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // 1. Update or insert local identity
  const [existingIdentity] = await db
    .select({ id: userIdentities.id })
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.userId, targetUser.id),
        eq(userIdentities.providerType, IdentityProviderType.LOCAL)
      )
    )
    .limit(1);

  if (existingIdentity) {
    await db
      .update(userIdentities)
      .set({ passwordHash })
      .where(eq(userIdentities.id, existingIdentity.id));
  } else {
    const { generateId } = await import('@cyris/shared');
    await db.insert(userIdentities).values({
      id: generateId(),
      userId: targetUser.id,
      providerType: IdentityProviderType.LOCAL,
      providerSubject: targetUser.email.toLowerCase(),
      passwordHash,
    });
  }

  // 2. Revoke all active Redis sessions for this user
  console.log('Revoking all active sessions for this operator...');
  const config = loadConfig();
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true });
  await redis.connect();

  const userSessionsKey = `cyris:user_sessions:${targetUser.id}`;
  const tokens = await redis.smembers(userSessionsKey);
  if (tokens.length > 0) {
    const sessionKeys = tokens.map((t) => `cyris:session:${t}`);
    await redis.del(...sessionKeys);
  }
  await redis.del(userSessionsKey);
  await redis.quit();

  console.log(`[Success] Password updated and ${tokens.length} active sessions revoked for '${targetUser.email}'.`);
  await closeDatabaseConnection();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n[Error] Password update failed:', (err as Error).message);
  await closeDatabaseConnection();
  process.exit(1);
});
