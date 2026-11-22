/** Never treat search-index snippets as trusted HTML or URLs. */
export function safeSearchResultRoute(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const root = 'https://cyris.invalid';
    const parsed = new URL(value, root);
    if (parsed.origin !== root || parsed.username || parsed.password) return null;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}

export interface SearchHighlightSegment { text: string; highlighted: boolean }

/**
 * Typesense highlights use <mark> only. Treat all remaining markup as plain
 * text; React will escape it. Never pass snippets to dangerouslySetInnerHTML.
 */
export function parseSearchHighlight(snippet: string): SearchHighlightSegment[] {
  const tokens = snippet.split(/(<\/?mark>)/gi);
  let highlighted = false;
  const segments: SearchHighlightSegment[] = [];
  for (const token of tokens) {
    if (/^<mark>$/i.test(token)) { highlighted = true; continue; }
    if (/^<\/mark>$/i.test(token)) { highlighted = false; continue; }
    if (token) segments.push({ text: token, highlighted });
  }
  return segments;
}
