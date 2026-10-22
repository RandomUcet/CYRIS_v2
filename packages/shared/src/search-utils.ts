/**
 * ==============================================================================
 * CYRIS v2 — Global Search Utilities & Query Parser
 * ==============================================================================
 */

/**
 * Deterministically normalizes text for search indexing while preserving alphanumeric and technical characters.
 * Removes Czech / Unicode diacritics and converts to lowercase.
 * Example: "Novotný" -> "novotny", "Český Cybertron" -> "cesky cybertron"
 */
export function normalizeSearchText(text?: string | null): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export interface ParsedSearchQuery {
  cleanQuery: string;
  typeFilter?: string;
  eventFilter?: string;
}

/**
 * Parses simple inline search syntax such as `type:unit` or `event:cybertron-2027`.
 * Leaves remaining keywords as cleanQuery.
 */
export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  let cleanQuery = rawQuery || '';
  let typeFilter: string | undefined;
  let eventFilter: string | undefined;

  // Match type:<value>
  const typeMatch = cleanQuery.match(/\btype:([a-zA-Z0-9_-]+)\b/i);
  if (typeMatch && typeMatch[1]) {
    typeFilter = typeMatch[1].toLowerCase();
    cleanQuery = cleanQuery.replace(typeMatch[0], '');
  }

  // Match event:<value>
  const eventMatch = cleanQuery.match(/\bevent:([a-zA-Z0-9_-]+)\b/i);
  if (eventMatch && eventMatch[1]) {
    eventFilter = eventMatch[1].toLowerCase();
    cleanQuery = cleanQuery.replace(eventMatch[0], '');
  }

  return {
    cleanQuery: cleanQuery.replace(/\s+/g, ' ').trim(),
    typeFilter,
    eventFilter,
  };
}
