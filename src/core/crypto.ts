import { argon2Sync, createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

// Layout of every sealed value: iv (12) | tag (16) | ciphertext. AES-256-GCM.
const IV = 12;
const TAG = 16;

export function newKey(): Buffer {
  return randomBytes(32);
}

/** Master password -> vault key with Argon2id (Node built-in). */
export function deriveVaultKey(password: string, salt: Buffer): Buffer {
  return argon2Sync('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    parallelism: 1,
    tagLength: 32,
    memory: 65536, // KiB = 64 MiB
    passes: 3,
  });
}

export function seal(key: Buffer, plain: Buffer | string): Buffer {
  const iv = randomBytes(IV);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function open(key: Buffer, sealed: Buffer): Buffer {
  const iv = sealed.subarray(0, IV);
  const tag = sealed.subarray(IV, IV + TAG);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(IV + TAG)), decipher.final()]);
}

export function openText(key: Buffer, sealed: Buffer): string {
  return open(key, sealed).toString('utf8');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Sub-key for a named purpose (e.g. the audit chain), derived from the vault key. */
export function subKey(vaultKey: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', vaultKey, Buffer.alloc(0), info, 32));
}

export function randomId(prefix: string, bytes = 6): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`;
}

export function randomToken(): string {
  return randomBytes(18).toString('base64url');
}
