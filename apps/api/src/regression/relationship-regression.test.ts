import assert from 'node:assert/strict';
import test from 'node:test';
import { skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

test('relationship regression suite requires an explicit isolated database opt-in', () => {
  assert.equal(
    process.env.CYRIS_TEST_DATABASE_ISOLATED === 'true' &&
      typeof process.env.CYRIS_TEST_DATABASE_URL === 'string',
    false
  );
});

skipWithoutVerifiedDatabase(
  'database: unauthorized relationship enumeration is denied or filtered for both endpoints',
  async () => {
    throw new Error(
      'Harness extension required: create isolated resources and exercise memberships, then call both relationship listing paths'
    );
  }
);

skipWithoutVerifiedDatabase(
  'database: cross-event relationship creation fails without mutation',
  async () => {
    throw new Error(
      'Harness extension required: create resources in separate isolated exercises and verify no relationship row is inserted'
    );
  }
);

skipWithoutVerifiedDatabase(
  'database: unauthorized relationship creation and removal fail without mutation',
  async () => {
    throw new Error(
      'Harness extension required: invoke the real controller/service authorization path with an unprivileged user'
    );
  }
);

skipWithoutVerifiedDatabase(
  'database: authorized relationship removal succeeds only within the exercise boundary',
  async () => {
    throw new Error(
      'Harness extension required: create an authorized relationship and verify event-scoped removal'
    );
  }
);
