import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { buildApi } from './api/routes.ts';
import { buildLeads } from './api/leads.ts';
import { type BlobStore, blobStoreFromEnv } from './core/blobstore.ts';
import type { Ctx, Env } from './core/context.ts';
import { openDb } from './core/db.ts';
import { Stage } from './core/stage.ts';
import { Vault } from './core/vault.ts';
import { chainHash, deriveAuditKey } from './audit/chain.ts';
import { setChainHasher } from './core/logs.ts';

// npm start runs from the package root, so static paths are relative to it.
const PANEL = './dist/panel';

export interface AppOptions extends Env {
  dataDir: string;
  masterPassword: string;
  sandboxKey: string;
  blobs?: BlobStore;
  send?: Ctx['send'];
  seed?: boolean;
}

/** Four sample items so the panel and the stage have one of each kind on a fresh vault. */
async function seed(vault: Vault): Promise<void> {
  if (vault.list().length > 1) return;
  vault.addSecret('password', 'Gmail 登入密碼', randomBytes(12).toString('base64url'));
  try {
    await vault.addFile('document', '租屋合約.pdf', Buffer.from(`%PDF-1.4\n% PassVault sample contract ${randomBytes(8).toString('hex')}\n`));
    await vault.addFile('photo', '護照照片.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(2048)]));
  } catch (e) {
    console.warn('sample files not stored:', (e as Error).message);
  }
}

export async function createApp(opts: AppOptions): Promise<{ app: Hono; ctx: Ctx }> {
  const db = openDb(opts.dataDir);
  const vault = new Vault(db, opts.blobs ?? blobStoreFromEnv(process.env, opts.dataDir));
  vault.unlock(opts.masterPassword);
  const auditKey = deriveAuditKey(vault.vaultKey);
  setChainHasher((prev, row) => chainHash(prev, row, auditKey));
  vault.ensureApiKey('SANDBOX_MAIL_KEY', opts.sandboxKey);
  if (opts.seed !== false) await seed(vault);

  const app = new Hono();
  const ctx: Ctx = {
    db,
    vault,
    stage: new Stage(),
    env: { publicUrl: opts.publicUrl.replace(/\/$/, ''), port: opts.port, agentToken: opts.agentToken, stageToken: opts.stageToken, phoneToken: opts.phoneToken },
    send: opts.send ?? ((url, init) => fetch(url, init)),
  };

  app.get('/healthz', (c) => c.json({ ok: true }));
  app.route('/api/leads', buildLeads(ctx));
  app.route('/api', buildApi(ctx));

  // The test mail API (src/sandbox, written by WDEV Claude) is mounted when present.
  const sandboxPath = './sandbox/mail.ts';
  if (existsSync(new URL(sandboxPath, import.meta.url))) {
    const mod = await import(sandboxPath);
    app.route('/sandbox/mail', mod.sandboxMail);
  }

  const page = (file: string) => (c: any) => {
    const path = `${PANEL}/${file}`;
    return existsSync(path) ? c.html(readFileSync(path, 'utf8')) : c.text('not built', 404);
  };
  app.get('/stage', page('stage.html'));
  app.get('/m/grants/:id', page('m.html'));
  app.get('/m/remote', page('remote.html'));
  app.get('/join', page('join.html'));
  app.use('/*', serveStatic({ root: PANEL }));

  return { app, ctx };
}
