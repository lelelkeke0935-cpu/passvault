import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localStore } from './blobstore.ts';
import { openDb } from './db.ts';
import { MAX_FILE, QuotaError, Vault } from './vault.ts';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'pv-'));
  const db = openDb(dir);
  const vault = new Vault(db, localStore(join(dir, 'blobs')));
  vault.unlock('test-master-password');
  return { dir, db, vault };
}

describe('vault', () => {
  it('stores all four kinds and keeps only ciphertext on disk', async () => {
    const { dir, db, vault } = fresh();
    vault.addSecret('password', 'Bank login', 'hunter2-plaintext-pw');
    vault.addSecret('api_key', 'MAIL_KEY', 'sk-live-plaintext-key-123');
    await vault.addFile('document', 'contract-secret.pdf', Buffer.from('CONTRACT PLAINTEXT BODY'));
    await vault.addFile('photo', 'passport-secret.jpg', Buffer.from('PHOTO PLAINTEXT BYTES'));
    db.close();

    const files = [join(dir, 'vault.db'), join(dir, 'vault.db-wal')];
    for (const sub of readdirSync(join(dir, 'blobs/u/me'))) files.push(join(dir, 'blobs/u/me', sub));
    const disk = files.map((f) => { try { return readFileSync(f).toString('latin1'); } catch { return ''; } }).join('');
    for (const plain of ['hunter2-plaintext-pw', 'sk-live-plaintext-key-123', 'CONTRACT PLAINTEXT', 'PHOTO PLAINTEXT', 'Bank login', 'contract-secret', 'passport-secret']) {
      expect(disk.includes(plain), plain).toBe(false);
    }
  });

  it('lists names and sizes without values, and reads files back', async () => {
    const { vault } = fresh();
    vault.addSecret('api_key', 'MAIL_KEY', 'sk-live-plaintext-key-123');
    const doc = await vault.addFile('document', 'a.pdf', Buffer.from('hello'));
    const list = vault.list();
    expect(list.map((i) => i.name)).toEqual(['MAIL_KEY', 'a.pdf']);
    expect(JSON.stringify(list)).not.toContain('sk-live');
    expect((await vault.readFile(doc.id))!.data.toString()).toBe('hello');
    expect(vault.usage().store).toBe('local');
  });

  it('refuses a wrong master password', () => {
    const { db, vault } = fresh();
    vault.addSecret('password', 'x', 'y');
    const again = new Vault(db, vault.blobs);
    expect(() => again.unlock('not-the-password')).toThrow();
  });

  it('rejects files over 50 MB', async () => {
    const { vault } = fresh();
    await expect(vault.addFile('document', 'big', Buffer.alloc(MAX_FILE + 1))).rejects.toBeInstanceOf(QuotaError);
  });
});
