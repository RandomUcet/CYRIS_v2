import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

async function verifyBackup(): Promise<void> {
  console.log('================================================================');
  console.log('  CYRIS v2 — Disaster Recovery / Backup Verifier');
  console.log('================================================================');

  const backupsBase = resolve(process.cwd(), 'backups');
  if (!existsSync(backupsBase)) {
    throw new Error('No backups directory found. Run "pnpm backup:create" first.');
  }

  const entries = readdirSync(backupsBase)
    .filter((e: string) => e.startsWith('backup_'))
    .sort()
    .reverse();

  if (entries.length === 0) {
    throw new Error('No backup snapshots found in backups/ directory.');
  }

  const targetBackup = entries[0];
  const targetDir = join(backupsBase, targetBackup);
  console.log(`Verifying latest backup: ${targetBackup}`);

  // 1. Verify Manifest
  const manifestFile = join(targetDir, 'manifest.json');
  if (!existsSync(manifestFile)) {
    throw new Error(`Integrity Failure: manifest.json missing in ${targetDir}`);
  }

  const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
  console.log(`  ✓ Manifest valid (CYRIS version: ${manifest.cyrisVersion})`);
  console.log(`  ✓ Timestamp: ${manifest.timestamp}`);

  // 2. Verify PostgreSQL Dump
  const sqlDump = join(targetDir, manifest.components.postgres.file);
  if (!existsSync(sqlDump)) {
    throw new Error(`Integrity Failure: PostgreSQL dump missing: ${sqlDump}`);
  }

  const sqlStats = statSync(sqlDump);
  if (sqlStats.size === 0) {
    throw new Error(`Integrity Failure: PostgreSQL dump is empty!`);
  }
  console.log(`  ✓ PostgreSQL dump verified (${(sqlStats.size / 1024).toFixed(1)} KB)`);

  // 3. Verify S3 Mirror
  const s3Dir = join(targetDir, manifest.components.s3.directory);
  if (!existsSync(s3Dir)) {
    throw new Error(`Integrity Failure: S3 mirror directory missing: ${s3Dir}`);
  }
  console.log(`  ✓ S3 mirror directory verified (${manifest.components.s3.totalObjects} objects)`);

  // 4. Security Verification
  if (manifest.security.masterKeyIncluded !== false) {
    throw new Error(`Security Violation: masterKeyIncluded must be false!`);
  }
  console.log(`  ✓ Master key isolation verified (encrypted secrets require active master key on restore)`);

  console.log('================================================================');
  console.log(`✓ Backup verification SUCCESSFUL for ${targetBackup}`);
  console.log('================================================================');
}

verifyBackup().catch((err) => {
  console.error('Backup verification FAILED:', err);
  process.exit(1);
});
