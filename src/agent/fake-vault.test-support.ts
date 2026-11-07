import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createClient, type CallInput, type CallResult, type Grant, type Stage } from './client.ts';

/** A real loopback HTTP server. All credentials are ephemeral and stay in memory. */
export async function startFakeVault() {
  const token = randomUUID();
  const app = new Hono();
  const requests: Array<{ path: string; method: string; authenticated: boolean; ownerCredential: boolean }> = [];
  const calls: Array<CallInput & { agent: string; caption: string }> = [];
  const stages: Stage['state'][] = ['idle', 'idle', 'intro'];
  const grantStatuses: Grant['status'][] = ['pending', 'allowed'];
  const callResults: CallResult[] = [];
  const lockdownStates: boolean[] = [];
  const grant: Grant = {
    id: 'g_demo', agent: 'vault-cli', secretName: 'SANDBOX_MAIL_KEY',
    summary: '寄給整份名單（只限一次，5 分鐘內有效）', status: 'pending',
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(),
    phoneUrl: 'https://phone.example/m/grants/g_demo',
  };
  const state = {
    locked: false, lockdownAvailable: false, secretsStatus: 200, resetCount: 0, sent: 0,
    unsafeBody: '', malformedSecrets: false, redirectTargetReached: false,
  };
  let addHandler: (input: { name: string; type: string; value: string }) => void = () => {};
  app.use('/api/*', async (c, next) => {
    const authenticated = c.req.header('X-Agent-Token') === token;
    requests.push({
      path: c.req.path, method: c.req.method, authenticated,
      ownerCredential: !!c.req.header('X-Stage-Token') || !!c.req.header('X-Phone-Token'),
    });
    if (!authenticated) return c.json({ error: '未授權' }, 401);
    await next();
  });
  app.get('/api/secrets', (c) => {
    if (state.secretsStatus !== 200) return c.json({ error: state.unsafeBody }, 503);
    if (state.malformedSecrets) return c.json({ error: state.unsafeBody });
    return c.json([{ name: 'SANDBOX_MAIL_KEY', service: 'sandbox-mail', allowHosts: ['127.0.0.1'] }]);
  });
  app.get('/api/stage', (c) => c.json({
    seq: 1, state: stages.length > 1 ? stages.shift() : stages[0],
    caption: '', blockedCount: 0, allowedCount: 0,
  }));
  app.get('/api/grants/:id', (c) => {
    if (c.req.param('id') === 'redirect') return c.redirect('/redirect-target');
    if (c.req.param('id') !== grant.id) return c.json({ error: '找不到授權單' }, 404);
    grant.status = grantStatuses.shift() ?? grant.status;
    return c.json(grant);
  });
  app.get('/redirect-target', (c) => { state.redirectTargetReached = true; return c.json([]); });
  app.post('/api/call', async (c) => {
    const input = await c.req.json<CallInput & { agent: string; caption: string }>();
    calls.push(input);
    const overridden = callResults.shift();
    if (overridden) return c.json(overridden);
    if (input.url.endsWith('/whoami')) {
      return c.json({ status: 'sent', httpStatus: 200, response: { yourKey: '▮▮▮▮', yourKeyB64: '▮▮▮▮' } });
    }
    if (!input.grant) return c.json({ status: 'blocked', reason: '寄給整份名單要你授權', grant: { id: grant.id, phoneUrl: grant.phoneUrl, summary: grant.summary } });
    if (input.grant === grant.id && grant.status === 'allowed') {
      grant.status = 'used';
      state.sent += 50;
      return c.json({ status: 'sent', httpStatus: 201, response: { sent: 50 } });
    }
    return c.json({ status: 'denied', reason: '授權只限一次' });
  });
  app.post('/api/items', async (c) => {
    addHandler(await c.req.json());
    return c.json({ id: 'item_demo', encrypted: true }, 201);
  });
  app.post('/api/demo/reset', (c) => {
    state.resetCount++;
    return c.json({ ok: true, locked: state.locked });
  });
  app.get('/api/lockdown', (c) => {
    if (!state.lockdownAvailable) return c.json({ error: '找不到功能' }, 404);
    state.locked = lockdownStates.shift() ?? state.locked;
    return c.json({ locked: state.locked });
  });

  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }) as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('測試伺服器未啟動。');
  const url = `http://127.0.0.1:${address.port}`;
  return {
    app, token, url, requests, calls, stages, grantStatuses, callResults, lockdownStates, grant, state,
    client: createClient({ url, token }),
    onAdd: (handler: typeof addHandler) => { addHandler = handler; },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

export type FakeVault = Awaited<ReturnType<typeof startFakeVault>>;
