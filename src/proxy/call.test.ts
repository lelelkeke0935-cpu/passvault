import { Hono } from 'hono';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { localStore } from '../core/blobstore.ts';

const KEY = 'sbx-test-key-0123456789abcdef';
const URL_BASE = 'http://127.0.0.1:8787';
const AGENT = { 'x-agent-token': 'agent-tok', 'content-type': 'application/json' };
const STAGE = { 'x-stage-token': 'stage-tok' };

// Stand-in for src/sandbox/mail.ts so these tests do not depend on another worker's branch.
function fakeMail() {
  const hits: string[] = [];
  const m = new Hono();
  m.use('*', async (c, next) => {
    if (c.req.header('authorization') !== `Bearer ${KEY}`) return c.json({ error: 'bad key' }, 401);
    hits.push(`${c.req.method} ${new URL(c.req.url).pathname}`);
    await next();
  });
  m.get('/sandbox/mail/whoami', (c) => {
    const k = c.req.header('authorization')!;
    return c.json({ yourKey: k, yourKeyB64: Buffer.from(k).toString('base64') });
  });
  m.post('/sandbox/mail/send', (c) => c.json({ messageId: 'm1' }, 201));
  m.post('/sandbox/mail/lists/:id/send', (c) => c.json({ sent: 50 }, 201));
  m.delete('/sandbox/mail/lists/:id', (c) => c.body(null, 204));
  return { m, hits };
}

let app: Hono;
let hits: string[];

beforeEach(async () => {
  const mail = fakeMail();
  hits = mail.hits;
  const dir = mkdtempSync(join(tmpdir(), 'pv-'));
  ({ app } = await createApp({
    dataDir: dir,
    masterPassword: 'pw-for-tests',
    sandboxKey: KEY,
    publicUrl: 'https://vault.example.test',
    port: 8787,
    agentToken: 'agent-tok',
    stageToken: 'stage-tok',
    phoneToken: 'phone-tok',
    blobs: localStore(join(dir, 'blobs')),
    send: (url, init) => mail.m.request(url, init),
  }));
});

const call = async (body: object) => (await app.request('/api/call', { method: 'POST', headers: AGENT, body: JSON.stringify(body) })).json();
const stage = async () => (await app.request('/api/stage')).json();
const listSend = { secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: `${URL_BASE}/sandbox/mail/lists/customers/send`, body: { subject: 'hi', body: 'x' }, agent: 'claude-code' };

describe('proxy', () => {
  it('needs the agent token', async () => {
    const r = await app.request('/api/call', { method: 'POST', body: '{}' });
    expect(r.status).toBe(401);
  });

  it('masks the key when the API echoes it back (whoami)', async () => {
    const r = await call({ secret: 'SANDBOX_MAIL_KEY', method: 'GET', url: `${URL_BASE}/sandbox/mail/whoami`, caption: '金鑰給我看' });
    expect(r.status).toBe('sent');
    expect(r.response.yourKey).toBe('Bearer ▮▮▮▮');
    expect(JSON.stringify(r)).not.toContain(KEY.slice(0, 8));
    expect((await stage()).state).toBe('masked');
    expect((await stage()).caption).toBe('金鑰給我看');
  });

  it('sends one email, blocks the whole list, then a grant works exactly once', async () => {
    expect((await call({ secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: `${URL_BASE}/sandbox/mail/send`, body: { to: 'a@example.test', subject: 's', body: 'b' } })).status).toBe('sent');

    const blocked = await call(listSend);
    expect(blocked.status).toBe('blocked');
    expect(blocked.grant.phoneUrl).not.toContain('token');
    expect(hits).not.toContain('POST /sandbox/mail/lists/customers/send');
    expect((await stage()).state).toBe('blocked');
    expect((await stage()).blockedCount).toBe(1);

    // the AI cannot authorize itself
    expect((await app.request(`/api/grants/${blocked.grant.id}/allow`, { method: 'POST', headers: AGENT })).status).toBe(401);
    // still pending: retry with grant stays blocked
    expect((await call({ ...listSend, grant: blocked.grant.id })).status).toBe('blocked');

    const allowed = await (await app.request(`/api/grants/${blocked.grant.id}/allow?token=phone-tok`, { method: 'POST' })).json();
    expect(allowed.status).toBe('allowed');
    expect((await stage()).state).toBe('allowed');

    // different request under the same grant is refused
    expect((await call({ ...listSend, body: { subject: 'other', body: 'x' }, grant: blocked.grant.id })).reason).toBe('授權單不包含這個動作');

    const sent = await call({ ...listSend, grant: blocked.grant.id });
    expect(sent.status).toBe('sent');
    expect(hits.filter((h) => h === 'POST /sandbox/mail/lists/customers/send')).toHaveLength(1);
    expect((await stage()).state).toBe('sent');

    const again = await call({ ...listSend, grant: blocked.grant.id });
    expect(again).toEqual({ status: 'denied', reason: '授權只限一次' });
    expect((await stage()).state).toBe('denied');
    const retry = await call({ ...listSend, grant: blocked.grant.id, caption: '我再試試' });
    expect(retry.status).toBe('denied');
    const s = await stage();
    expect(s.state).toBe('retry');
    expect(s.allowedCount).toBe(1);
    expect(hits.filter((h) => h === 'POST /sandbox/mail/lists/customers/send')).toHaveLength(1);
  });

  it('denies deleting the list and never sends it', async () => {
    const r = await call({ secret: 'SANDBOX_MAIL_KEY', method: 'DELETE', url: `${URL_BASE}/sandbox/mail/lists/customers` });
    expect(r).toEqual({ status: 'denied', reason: '規則不允許這個動作' });
    expect(hits).toHaveLength(0);
  });

  it('refuses a request that carries a vault secret (#9)', async () => {
    const r = await call({ secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: `${URL_BASE}/sandbox/mail/send`, body: { to: 'a@example.test', subject: 's', body: Buffer.from(KEY).toString('base64') } });
    expect(r).toEqual({ status: 'denied', reason: '請求內容含保險箱裡的祕密' });
    expect(hits).toHaveLength(0);
  });

  it('lockdown revokes grants, refuses every call, and only the owner unlocks (#4)', async () => {
    const blocked = await call(listSend);
    expect((await app.request('/api/lockdown?token=nope', { method: 'POST' })).status).toBe(401);
    expect((await app.request('/api/lockdown?token=phone-tok', { method: 'POST' })).status).toBe(200);
    expect((await stage()).state).toBe('locked');
    expect((await (await app.request(`/api/grants/${blocked.grant.id}`)).json()).status).toBe('revoked');
    const r = await call({ secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: `${URL_BASE}/sandbox/mail/send`, body: { to: 'a@example.test' } });
    expect(r.reason).toBe('保險箱已鎖住，所有授權已收回');
    expect(hits).toHaveLength(0);
    expect((await app.request('/api/lockdown/unlock', { method: 'POST', headers: AGENT })).status).toBe(403);
    const agentReset = await (await app.request('/api/demo/reset', { method: 'POST', headers: AGENT })).json();
    expect(agentReset.locked).toBe(true);
    const stageReset = await (await app.request('/api/demo/reset', { method: 'POST', headers: STAGE })).json();
    expect(stageReset.locked).toBe(false);
    expect((await call({ secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: `${URL_BASE}/sandbox/mail/send`, body: { to: 'a@example.test' } })).status).toBe('sent');
  });

  it('evidence: the key never reached the AI; secrets list has no values', async () => {
    await call({ secret: 'SANDBOX_MAIL_KEY', method: 'GET', url: `${URL_BASE}/sandbox/mail/whoami` });
    await call(listSend);
    const ev = await (await app.request('/api/evidence')).json();
    expect(ev.keyGivenToAi).toBe(false);
    expect(ev.sent).toBe(1);
    expect(ev.blocked).toBe(1);
    expect(Object.keys(ev.recent[0]).sort()).toEqual(['agent', 'at', 'grantId', 'id', 'method', 'outcome', 'reason', 'secret', 'url']);
    const secrets = await (await app.request('/api/secrets', { headers: AGENT })).json();
    expect(secrets).toEqual([{ name: 'SANDBOX_MAIL_KEY', service: '測試用寄信 API', allowHosts: ['127.0.0.1', 'localhost'] }]);
    const items = await (await app.request('/api/items')).json();
    expect(items.map((i: any) => i.type).sort()).toEqual(['api_key', 'document', 'password', 'photo']);
    expect(JSON.stringify(items)).not.toContain('value');
  });

  it('phone remote shows the pending grant; stage intro needs the stage token', async () => {
    expect((await app.request('/api/remote')).status).toBe(401);
    await call(listSend);
    const r = await (await app.request('/api/remote?token=phone-tok')).json();
    expect(r.state).toBe('blocked');
    expect(r.grant.summary).toContain('只限一次');
    expect((await app.request('/api/stage/intro', { method: 'POST' })).status).toBe(401);
    expect((await app.request('/api/stage/intro', { method: 'POST', headers: STAGE })).status).toBe(200);
  });
});
