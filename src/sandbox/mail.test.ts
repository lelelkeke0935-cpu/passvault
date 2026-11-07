import { beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const KEY = `sk_test_${randomBytes(16).toString('hex')}`;
let app: Hono;

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pv-sandbox-'));
  process.env.SANDBOX_MAIL_KEY = KEY;
  const { sandboxMail } = await import('./mail.ts');
  app = new Hono().route('/sandbox/mail', sandboxMail);
});

const auth = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

function post(path: string, body: unknown, headers: Record<string, string> = auth) {
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function log() {
  const res = await app.request('/sandbox/mail/log', { headers: auth });
  return { res, rows: (await res.json()) as any[] };
}

describe('sandbox mail', () => {
  it('rejects a missing or wrong key with 401', async () => {
    const none = await post('/sandbox/mail/send', { to: 'a@example.test' }, { 'Content-Type': 'application/json' });
    expect(none.status).toBe(401);
    const wrong = await post('/sandbox/mail/send', { to: 'a@example.test' }, { Authorization: 'Bearer nope' });
    expect(wrong.status).toBe(401);
    expect((await app.request('/sandbox/mail/log')).status).toBe(401);
    expect((await app.request('/sandbox/mail/whoami')).status).toBe(401);
  });

  it('sends one mail', async () => {
    const res = await post('/sandbox/mail/send', { to: 'customer01@example.test', subject: 'hi', body: 'hello' });
    expect(res.status).toBe(201);
    expect((await res.json()).messageId).toMatch(/^m_/);
  });

  it('rejects a send with no valid recipient', async () => {
    expect((await post('/sandbox/mail/send', { subject: 'x' })).status).toBe(400);
  });

  it('sends to the customers list', async () => {
    const res = await post('/sandbox/mail/lists/customers/send', { subject: 'news', body: 'hello all' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ sent: 50 });
    expect((await post('/sandbox/mail/lists/nobody/send', {})).status).toBe(404);
  });

  it('accepts deleting the list but keeps it', async () => {
    const res = await app.request('/sandbox/mail/lists/customers', { method: 'DELETE', headers: auth });
    expect(res.status).toBe(204);
    expect((await post('/sandbox/mail/lists/customers/send', {})).status).toBe(201);
  });

  it('whoami leaks the key in raw and Base64 form', async () => {
    const res = await app.request('/sandbox/mail/whoami', { headers: auth });
    const j = await res.json();
    expect(j.yourKey).toBe(`Bearer ${KEY}`);
    expect(j.yourKeyB64).toBe(Buffer.from(KEY).toString('base64'));
  });

  it('logs every request with the key masked, and reading the log is not logged', async () => {
    await post('/sandbox/mail/send', { to: 'b@example.test', body: `oops ${KEY}` });
    const { rows } = await log();
    const again = await log();
    expect(again.rows.length).toBe(rows.length);

    const text = JSON.stringify(rows);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(KEY.slice(0, 8));
    expect(rows.find((r) => r.status === 401 && r.authorization === null)).toBeTruthy();
    const list = rows.find((r) => r.path === '/sandbox/mail/lists/customers/send' && r.status === 201);
    expect(list).toMatchObject({ method: 'POST', authorization: '▮▮▮▮', recipients: 50 });
    expect(rows.every((r) => r.authorization === null || r.authorization === '▮▮▮▮')).toBe(true);

    // The stored body (not returned by /log) is masked too.
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(join(process.env.DATA_DIR!, 'vault.db'), { readonly: true });
    const bodies = db.prepare('SELECT body FROM sandbox_log').all() as { body: string | null }[];
    db.close();
    expect(JSON.stringify(bodies)).not.toContain(KEY);
    expect(JSON.stringify(bodies)).toContain('oops ▮▮▮▮');
  });

  it('clearSandboxLog empties the log', async () => {
    const { clearSandboxLog } = await import('./mail.ts');
    clearSandboxLog();
    expect((await log()).rows).toEqual([]);
  });
});
