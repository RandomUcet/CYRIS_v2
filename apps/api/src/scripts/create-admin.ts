import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import * as argon2 from 'argon2';
import { eq, and } from 'drizzle-orm';
import {
  getDbClient,
  closeDatabaseConnection,
  users,
  userIdentities,
  roles,
  rolePermissions,
  roleAssignments,
  UserStatus,
  IdentityProviderType,
} from '@cyris/db';
import { generateId, Permissions, PermissionScopes } from '@cyris/shared';

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
  console.log('  CYRIS v2 — Platform Administrator Bootstrap');
  console.log('================================================================\n');

  // Support environment variables for non-interactive test runs
  let email = process.env.CYRIS_ADMIN_EMAIL || '';
  let displayName = process.env.CYRIS_ADMIN_NAME || '';
  let password = process.env.CYRIS_ADMIN_PASSWORD || '';

  if (!email) {
    email = await askQuestion('Email: ');
  }
  if (!email || !email.includes('@')) {
    console.error('Error: A valid email address is required.');
    process.exit(1);
  }

  const db = getDbClient();

  // Safe re-run check: verify if user already exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existingUser) {
    console.log(`\n[Notice] User with email '${email}' already exists. No duplicate created.`);
    await closeDatabaseConnection();
    process.exit(0);
  }

  if (!displayName) {
    displayName = await askQuestion('Display name: ');
  }
  if (!displayName) {
    displayName = email.split('@')[0] || 'Administrator';
  }

  if (!password) {
    password = await askSecret('Password: ');
    const confirmPassword = await askSecret('Confirm password: ');

    if (password !== confirmPassword) {
      console.error('\nError: Passwords do not match.');
      await closeDatabaseConnection();
      process.exit(1);
    }
  }

  if (password.length < 8) {
    console.error('\nError: Password must be at least 8 characters long.');
    await closeDatabaseConnection();
    process.exit(1);
  }

  console.log('\nHashing credentials with Argon2id...');
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const userId = generateId();

  await db.transaction(async (tx) => {
    // 1. Create User Profile
    await tx.insert(users).values({
      id: userId,
      email: email.toLowerCase(),
      displayName,
      status: UserStatus.ACTIVE,
    });

    // 2. Create Local Identity
    await tx.insert(userIdentities).values({
      id: generateId(),
      userId,
      providerType: IdentityProviderType.LOCAL,
      providerSubject: email.toLowerCase(),
      passwordHash,
    });

    // 3. Ensure Platform Administrator role exists
    let [adminRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.slug, 'platform-admin')))
      .limit(1);

    if (!adminRole) {
      const roleId = generateId();
      const [inserted] = await tx
        .insert(roles)
        .values({
          id: roleId,
          eventId: null,
          name: 'Platform Administrator',
          slug: 'platform-admin',
          description: 'Full administrative control over the CYRIS platform',
        })
        .returning();
      adminRole = inserted!;

      // Assign platform.manage permission with PLATFORM scope
      await tx.insert(rolePermissions).values({
        id: generateId(),
        roleId: adminRole.id,
        permissionKey: Permissions.PLATFORM_MANAGE,
        scope: PermissionScopes.PLATFORM,
      });
    }

    // 4. Assign Platform Administrator role to user
    await tx.insert(roleAssignments).values({
      id: generateId(),
      roleId: adminRole.id,
      userId,
    });
  });

  console.log(`[Success] Platform administrator '${email}' created successfully!`);
  await closeDatabaseConnection();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[Error] Admin bootstrap failed:', err);
  await closeDatabaseConnection();
  process.exit(1);
});
