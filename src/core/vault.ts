import { randomBytes } from 'node:crypto';
import type { BlobStore } from './blobstore.ts';
import { deriveVaultKey, newKey, open, openText, randomId, seal } from './crypto.ts';
import { type DB, getSetting, now, setSetting } from './db.ts';

export type ItemType = 'password' | 'api_key' | 'document' | 'photo';
export const ITEM_TYPES: ItemType[] = ['password', 'api_key', 'document', 'photo'];

export const QUOTA = 50 * 1024 ** 3; // 50 GB per owner, counted on ciphertext size
export const MAX_FILE = 50 * 1024 ** 2; // 50 MB per file (the free tunnel caps uploads near 100 MB)
const OWNER = 'me';
const VERIFIER = 'passvault-ok';

export interface ItemRow {
  id: string;
  owner: string;
  type: ItemType;
  name_enc: Buffer;
  wrapped_key: Buffer;
  value_enc: Buffer | null;
  blob_key: string | null;
  size: number;
  created_at: string;
}

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  size: number;
  createdAt: string;
}

export class QuotaError extends Error {
  constructor(public body: Record<string, unknown>) {
    super(String(body.error));
  }
}

export class Vault {
  private key: Buffer | null = null;

  constructor(
    private db: DB,
    public blobs: BlobStore,
  ) {}

  /** Derive the vault key from the master password; refuse a wrong password. */
  unlock(password: string): void {
    let salt = getSetting(this.db, 'kdf_salt');
    if (!salt) {
      salt = randomBytes(16).toString('base64');
      setSetting(this.db, 'kdf_salt', salt);
    }
    const key = deriveVaultKey(password, Buffer.from(salt, 'base64'));
    const verifier = getSetting(this.db, 'verifier');
    if (!verifier) {
      setSetting(this.db, 'verifier', seal(key, VERIFIER).toString('base64'));
    } else {
      try {
        if (openText(key, Buffer.from(verifier, 'base64')) !== VERIFIER) throw new Error();
      } catch {
        throw new Error('wrong master password for this vault');
      }
    }
    this.key = key;
  }

  get vaultKey(): Buffer {
    if (!this.key) throw new Error('vault is locked');
    return this.key;
  }

  private itemKey(row: ItemRow): Buffer {
    return open(this.vaultKey, row.wrapped_key);
  }

  private toItem(row: ItemRow): Item {
    return { id: row.id, type: row.type, name: openText(this.vaultKey, row.name_enc), size: row.size, createdAt: row.created_at };
  }

  private rows(): ItemRow[] {
    return this.db.prepare('SELECT * FROM items WHERE owner = ? ORDER BY created_at').all(OWNER) as ItemRow[];
  }

  list(): Item[] {
    return this.rows().map((r) => this.toItem(r));
  }

  /** Passwords and API keys: the value is sealed with the item's own key, stored in SQLite. */
  addSecret(type: 'password' | 'api_key', name: string, value: string): Item {
    const itemKey = newKey();
    const id = randomId('i', 8);
    const valueEnc = seal(itemKey, value);
    const row = {
      id,
      owner: OWNER,
      type,
      name_enc: seal(this.vaultKey, name),
      wrapped_key: seal(this.vaultKey, itemKey),
      value_enc: valueEnc,
      blob_key: null,
      size: valueEnc.length,
      created_at: now(),
    };
    this.db
      .prepare('INSERT INTO items (id, owner, type, name_enc, wrapped_key, value_enc, blob_key, size, created_at) VALUES (@id, @owner, @type, @name_enc, @wrapped_key, @value_enc, @blob_key, @size, @created_at)')
      .run(row);
    return this.toItem(row as ItemRow);
  }

  /** Documents and photos: encrypted here, then the ciphertext goes to the blob store under a random key. */
  async addFile(type: 'document' | 'photo', name: string, data: Buffer): Promise<Item> {
    if (data.length > MAX_FILE) throw new QuotaError({ error: '單一檔案上限 50 MB' });
    const itemKey = newKey();
    const sealed = seal(itemKey, data);
    const used = this.usage().used;
    if (used + sealed.length > QUOTA) throw new QuotaError({ error: '空間已滿', used, quota: QUOTA });
    const id = randomId('i', 8);
    const blobKey = `u/${OWNER}/${id}`;
    await this.blobs.put(blobKey, sealed);
    const row = {
      id,
      owner: OWNER,
      type,
      name_enc: seal(this.vaultKey, name),
      wrapped_key: seal(this.vaultKey, itemKey),
      value_enc: null,
      blob_key: blobKey,
      size: sealed.length,
      created_at: now(),
    };
    this.db
      .prepare('INSERT INTO items (id, owner, type, name_enc, wrapped_key, value_enc, blob_key, size, created_at) VALUES (@id, @owner, @type, @name_enc, @wrapped_key, @value_enc, @blob_key, @size, @created_at)')
      .run(row);
    return this.toItem(row as ItemRow);
  }

  async readFile(id: string): Promise<{ item: Item; data: Buffer } | undefined> {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ? AND owner = ?').get(id, OWNER) as ItemRow | undefined;
    if (!row || !row.blob_key) return undefined;
    const sealed = await this.blobs.get(row.blob_key);
    return { item: this.toItem(row), data: open(this.itemKey(row), sealed) };
  }

  usage(): { used: number; quota: number; store: BlobStore['kind'] } {
    const r = this.db.prepare("SELECT COALESCE(SUM(size), 0) AS used FROM items WHERE owner = ? AND blob_key IS NOT NULL").get(OWNER) as { used: number };
    return { used: r.used, quota: QUOTA, store: this.blobs.kind };
  }

  /** Decrypted secret values, by name. Server-side only; never returned to the AI or the panel. */
  secretValues(types: ItemType[] = ['api_key', 'password']): { name: string; type: ItemType; value: string }[] {
    return this.rows()
      .filter((r) => types.includes(r.type) && r.value_enc)
      .map((r) => ({ name: openText(this.vaultKey, r.name_enc), type: r.type, value: openText(this.itemKey(r), r.value_enc!) }));
  }

  secretValue(name: string): string | undefined {
    return this.secretValues(['api_key']).find((s) => s.name === name)?.value;
  }

  /** Make sure the named API key exists with this value (used for SANDBOX_MAIL_KEY at startup). */
  ensureApiKey(name: string, value: string): void {
    const current = this.secretValue(name);
    if (current === value) return;
    if (current !== undefined) {
      for (const r of this.rows()) {
        if (r.type === 'api_key' && openText(this.vaultKey, r.name_enc) === name) this.db.prepare('DELETE FROM items WHERE id = ?').run(r.id);
      }
    }
    this.addSecret('api_key', name, value);
  }
}
