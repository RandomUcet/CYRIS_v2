/**
 * Notification templates are remotely supplied data; only open local application
 * routes and never route to external protocols, protocol-relative URLs or slashes.
 */
export function safeNotificationHref(value:string|null|undefined):string|null {
  if(!value || !value.startsWith('/') || value.startsWith('//') ||
    value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
