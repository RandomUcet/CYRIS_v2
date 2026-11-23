import { generateId } from '@cyris/shared';

// Header identifiers are correlation hints, never authoritative identity.
// If a caller supplies unexpected markup, whitespace, control characters,
// arrays or excessive input, issue a fresh server-generated opaque ID.
const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

export function sanitizeRequestId(headerValue?: unknown): string {
  if (typeof headerValue === 'string') {
    const trimmed = headerValue.trim();
    if (SAFE_REQUEST_ID_REGEX.test(trimmed)) return trimmed;
  }
  return generateId();
}
