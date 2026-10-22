import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export interface EncryptedSecretPayload {
  encryptedValue: string; // base64
  iv: string;             // base64
  authTag: string;        // base64
  keyVersion: number;
  algorithm: 'aes-256-gcm';
}

/**
 * Validates and decodes the CYRIS_MASTER_KEY into a strictly 32-byte (256-bit) Buffer.
 * Supports both base64-encoded and hex-encoded 32-byte keys.
 */
export function parseMasterKey(keyInput: string): Buffer {
  if (!keyInput || typeof keyInput !== 'string') {
    throw new Error('CYRIS_MASTER_KEY must be a non-empty string.');
  }

  const trimmed = keyInput.trim();

  // Try hex if 64 characters
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'hex');
    if (buf.length === 32) return buf;
  }

  // Try base64
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    // fall through to error
  }

  // Also check if raw utf-8 string is exactly 32 bytes
  const utf8Buf = Buffer.from(trimmed, 'utf-8');
  if (utf8Buf.length === 32) return utf8Buf;

  throw new Error(
    `Invalid CYRIS_MASTER_KEY: Key must resolve to exactly 32 bytes (256 bits) for AES-256-GCM envelope encryption. Provided key resolved to ${utf8Buf.length} bytes.`
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a fresh 12-byte initialization vector.
 */
export function encryptSecret(
  plaintext: string,
  masterKey: string | Buffer,
  keyVersion = 1
): EncryptedSecretPayload {
  const keyBuf = Buffer.isBuffer(masterKey) ? masterKey : parseMasterKey(masterKey);

  // 12-byte IV is standard for GCM (NIST SP 800-38D)
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);

  const encryptedBuf = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encryptedBuf.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion,
    algorithm: 'aes-256-gcm',
  };
}

/**
 * Decrypts an AES-256-GCM payload.
 * Fails closed (throws Error) if the ciphertext, IV, or authentication tag is invalid or tampered with.
 */
export function decryptSecret(
  payload: {
    encryptedValue: string;
    iv: string;
    authTag: string;
    algorithm?: string;
  },
  masterKey: string | Buffer
): string {
  if (payload.algorithm && payload.algorithm !== 'aes-256-gcm') {
    throw new Error(`Unsupported encryption algorithm: ${payload.algorithm}`);
  }

  const keyBuf = Buffer.isBuffer(masterKey) ? masterKey : parseMasterKey(masterKey);
  const ivBuf = Buffer.from(payload.iv, 'base64');
  const authTagBuf = Buffer.from(payload.authTag, 'base64');
  const encryptedBuf = Buffer.from(payload.encryptedValue, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', keyBuf, ivBuf);
  decipher.setAuthTag(authTagBuf);

  try {
    const decryptedBuf = Buffer.concat([
      decipher.update(encryptedBuf),
      decipher.final(),
    ]);
    return decryptedBuf.toString('utf-8');
  } catch (err) {
    throw new Error(
      'Cryptographic authentication failure: The secret ciphertext or authentication tag is invalid.'
    );
  }
}

/**
 * Generates a cryptographically secure random 32-byte master key encoded as base64.
 */
export function generateMasterKey(): string {
  return randomBytes(32).toString('base64');
}
