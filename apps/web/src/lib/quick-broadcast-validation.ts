/** Never deliver a stock EXCON template before the placeholders are replaced.
 * Save-as-draft remains available for incomplete templates.
 */
export function containsUnfilledBroadcastTemplate(text:string):boolean {
  return /\[(?:DOPLŇTE(?:\s+[^\]]+)?|FILL\s+IN(?:\s+[^\]]+)?)\]/i.test(text);
}
