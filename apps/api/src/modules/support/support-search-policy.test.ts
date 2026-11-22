import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { supportSubjectContainsPattern } from './support-search-policy.js';

describe('Support search wildcard policy', () => {
  it('escapes PostgreSQL LIKE wildcards and literal backslashes', () => {
    assert.equal(supportSubjectContainsPattern('server'), '%server%');
    assert.equal(supportSubjectContainsPattern('a%b'), '%a\\%b%');
    assert.equal(supportSubjectContainsPattern('a_b'), '%a\\_b%');
    assert.equal(supportSubjectContainsPattern('a\\b'), '%a\\\\b%');
  });
  it('does not interpolate SQL', () => {
    assert.equal(supportSubjectContainsPattern("a' OR 1=1 --"), "%a' OR 1=1 --%");
  });
});
