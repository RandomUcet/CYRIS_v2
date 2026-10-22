import { randomBytes } from 'node:crypto';

function main() {
  const masterKey = randomBytes(32).toString('base64');

  console.log('================================================================');
  console.log('  CYRIS v2 — Cryptographic Master Key Generator');
  console.log('================================================================\n');
  console.log('Generated 256-bit AES-GCM Master Key (Base64 encoded):\n');
  console.log(`CYRIS_MASTER_KEY=${masterKey}\n`);
  console.log('Instructions:');
  console.log('1. Copy the line above into your production server environment or .env file.');
  console.log('2. Ensure this key is stored securely with restricted file permissions.');
  console.log('3. NEVER commit this key into git or expose it via any API or log.');
  console.log('4. For security, .env has NOT been automatically modified.\n');
  console.log('================================================================\n');
}

main();
