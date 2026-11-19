import { test } from 'node:test';

/**
 * Database regression tests must opt in to an independently provisioned,
 * disposable database. A URL alone is insufficient evidence of isolation.
 */
export function requireVerifiedIsolatedDatabase(): string | null {
  const url = process.env.CYRIS_TEST_DATABASE_URL;
  const isolationMarker = process.env.CYRIS_TEST_DATABASE_ISOLATED;

  if (!url || isolationMarker !== 'true') {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      return null;
    }
  } catch {
    return null;
  }

  return url;
}

export function skipWithoutVerifiedDatabase(
  name: string,
  callback: () => void | Promise<void>
): void {
  const reason =
    'NOT RUN: CYRIS_TEST_DATABASE_URL and CYRIS_TEST_DATABASE_ISOLATED=true for an isolated local disposable database are required';

  if (!requireVerifiedIsolatedDatabase()) {
    test(name, { skip: reason }, callback);
    return;
  }

  test(name, callback);
}
