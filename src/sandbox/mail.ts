import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Test mail API. Nothing is ever sent; every request is only written to sandbox_log.
// server.ts mounts this router at /sandbox/mail.

export const MASK = '▮▮▮▮';

export const customers = Array.from(
  { length: 50 },
  (_, i) => `customer${String(i + 1).padStart(2, '0')}@example.test`,
);

const lists: Record<string, string[]> = { customers };

let db: Database.Database | undefined;

function getDb() {
  if (!db) {
    const dir = process.env.DATA_DIR ?? './data';
    mkdirSync(dir, { recursive: true });
    db = new Database(join(dir, 'vault.db'));
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE IF NOT EXISTS sandbox_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      authorization TEXT,
      recipients INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL,
      body TEXT
    )`);
  }
  return db;
}

/** For /api/demo/reset: works even before the first sandbox request created the table. */
export function clearSandboxLog() {
  getDb().exec('DELETE FROM sandbox_log');
}

function sha(s: string) {
  return createHash('sha256').update(s).digest();
}

function keyOk(header: string | undefined) {
  const key = process.env.SANDBOX_MAIL_KEY;
  if (!key || !header?.startsWith('Bearer ')) return false;
  return timingSafeEqual(sha(header.slice(7)), sha(key));
}

function bearer(header: string | undefined) {
  return header?.startsWith('Bearer ') ? header.slice(7) : (header ?? '');
}

async function readJson(c: { req: { json(): Promise<any> } }) {
  try {
    const v = await c.req.json();
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

type Env = { Variables: { recipients: number; body: unknown } };

export const sandboxMail = new Hono<Env>();

sandboxMail.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  const ok = keyOk(auth);
  if (ok) await next();
  // Reading the log is not itself logged, so callers can diff it before and after.
  if (c.req.method === 'GET' && c.req.path.endsWith('/log') && ok) return;
  const status = ok ? c.res.status : 401;
  let body = c.get('body') === undefined ? null : JSON.stringify(c.get('body'));
  const key = process.env.SANDBOX_MAIL_KEY;
  if (body && key) body = body.split(key).join(MASK);
  getDb()
    .prepare(
      'INSERT INTO sandbox_log (at, method, path, authorization, recipients, status, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      new Date().toISOString(),
      c.req.method,
      c.req.path,
      auth === undefined ? null : MASK,
      c.get('recipients') ?? 0,
      status,
      body,
    );
  if (!ok) return c.json({ error: 'unauthorized' }, 401);
});

sandboxMail.post('/send', async (c) => {
  const body = await readJson(c);
  c.set('body', body);
  const to: unknown[] = Array.isArray(body.to) ? body.to : [body.to];
  if (to.length === 0 || !to.every((x) => typeof x === 'string' && x.includes('@'))) {
    return c.json({ error: 'to must be an address or an array of addresses' }, 400);
  }
  c.set('recipients', to.length);
  return c.json({ messageId: `m_${randomBytes(8).toString('hex')}` }, 201);
});

sandboxMail.post('/lists/:id/send', async (c) => {
  c.set('body', await readJson(c));
  const list = lists[c.req.param('id')];
  if (!list) return c.json({ error: 'no such list' }, 404);
  c.set('recipients', list.length);
  return c.json({ sent: list.length }, 201);
});

// The demo list is never really removed; the policy blocks this route anyway.
sandboxMail.delete('/lists/:id', (c) => {
  if (!lists[c.req.param('id')]) return c.json({ error: 'no such list' }, 404);
  return c.body(null, 204);
});

// Deliberate leak: echoes the caller's key so the vault can prove it masks it before the AI sees it.
// yourKeyB64 encodes the bearer token itself, which is the form the leak scanner looks for.
sandboxMail.get('/whoami', (c) => {
  const auth = c.req.header('Authorization');
  return c.json({ yourKey: auth, yourKeyB64: Buffer.from(bearer(auth)).toString('base64') });
});

sandboxMail.get('/log', (c) => {
  const rows = getDb()
    .prepare('SELECT id, at, method, path, authorization, recipients, status FROM sandbox_log ORDER BY id')
    .all();
  return c.json(rows);
});
