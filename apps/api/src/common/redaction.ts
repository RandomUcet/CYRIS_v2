/**
 * ==============================================================================
 * CYRIS v2 — Structured Sensitive Data Redaction
 * ==============================================================================
 * Prevents credentials, hashes, session tokens, and cryptographic keys from
 * leaking into audit logs, error messages, or persistent events.
 */

const SENSITIVE_KEY_PATTERN = /password|hash|token|secret|masterkey|apikey|authorization|cookie|credential/i;

export function redactSensitiveData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
