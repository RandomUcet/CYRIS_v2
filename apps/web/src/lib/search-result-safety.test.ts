import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchHighlight, safeSearchResultRoute } from './search-result-safety.js';

describe('untrusted global search result rendering', () => {
  it('keeps only same-origin relative paths for navigation', () => {
    assert.equal(safeSearchResultRoute('/events/abc/medical?q=test'), '/events/abc/medical?q=test');
    for (const value of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid',
      'javascript:alert(1)', 'data:text/html,hi', '/events/abc\nInjected', '', null, {}]) {
      assert.equal(safeSearchResultRoute(value), null);
    }
  });
  it('recognizes mark delimiters without interpreting unsafe HTML', () => {
    assert.deepEqual(parseSearchHighlight('Before <mark>safe</mark> after'), [
      { text: 'Before ', highlighted: false }, { text: 'safe', highlighted: true },
      { text: ' after', highlighted: false },
    ]);
    const input = '<img src=x onerror=alert(1)> <mark>test</mark>';
    assert.deepEqual(parseSearchHighlight(input), [
      { text: '<img src=x onerror=alert(1)> ', highlighted: false },
      { text: 'test', highlighted: true },
    ]);
  });
});
