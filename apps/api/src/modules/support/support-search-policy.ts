/** Treat user search terms literally inside PostgreSQL ILIKE, never as %/_ wildcards. */
export function supportSubjectContainsPattern(query: string): string {
  return '%' + query.replace(/[%_\\]/g, character => '\\' + character) + '%';
}
