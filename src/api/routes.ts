import { Hono, type Context } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import type { Ctx } from '../core/context.ts';
import { lock, lockState, unlock } from '../core/lockdown.ts';
import { countOutcomes, mcpContents, proxyLogs } from '../core/logs.ts';
import { ITEM_TYPES, QuotaError, type ItemType } from '../core/vault.ts';
import { POLICIES } from '../policy/rules.ts';
import { allowGrant, callApi, denyGrant, getGrant, type CallRequest, type GrantRow } from '../proxy/call.ts';
import { variants } from '../proxy/leak.ts';

function same(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function buildApi(ctx: Ctx): Hono {
  const api = new Hono();
  const isAgent = (c: Context) => same(c.req.header('x-agent-token'), ctx.env.agentToken);
  const isStage = (c: Context) => same(c.req.header('x-stage-token'), ctx.env.stageToken);
  const isPhone = (c: Context) => same(c.req.query('token'), ctx.env.phoneToken);
  const unauthorized = (c: Context) => c.json({ error: '需要通行碼' }, 401);

  /** Grant as the panel/stage/phone sees it. The token-bearing URL only goes to the owner (stage token). */
  const grantView = (g: GrantRow, owner = false) => ({
    id: g.id,
    agent: g.agent,
    secretName: g.secret_name,
    summary: g.summary,
    status: g.status,
    createdAt: g.created_at,
    expiresAt: g.expires_at,
    phoneUrl: `${ctx.env.publicUrl}/m/grants/${g.id}${owner ? `?token=${g.token}` : ''}`,
  });
  const allGrants = () => ctx.db.prepare('SELECT * FROM grants ORDER BY created_at DESC').all() as GrantRow[];
  const currentGrant = () => {
    const id = ctx.stage.grantId;
    const g = id ? getGrant(ctx, id) : undefined;
    return g ?? (ctx.db.prepare("SELECT * FROM grants WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1").get() as GrantRow | undefined);
  };
  const counts = () => {
    const blockedCount = (ctx.db.prepare("SELECT COUNT(*) AS n FROM proxy_log WHERE outcome IN ('blocked', 'denied')").get() as { n: number }).n;
    const allowedCount = (ctx.db.prepare('SELECT COUNT(*) AS n FROM grants WHERE allowed_at IS NOT NULL').get() as { n: number }).n;
    return { blockedCount, allowedCount };
  };

  // ---- vault items
  api.get('/items', (c) => c.json(ctx.vault.list()));

  api.post('/items', async (c) => {
    if (!isAgent(c) && !isStage(c)) return unauthorized(c);
    try {
      if ((c.req.header('content-type') ?? '').startsWith('multipart/form-data')) {
        const form = await c.req.parseBody();
        const file = form.file;
        const type = String(form.type ?? '') as ItemType;
        if (!(file instanceof File) || (type !== 'document' && type !== 'photo')) return c.json({ error: '請附上檔案，類型是 document 或 photo' }, 400);
        const item = await ctx.vault.addFile(type, file.name, Buffer.from(await file.arrayBuffer()));
        return c.json({ id: item.id, encrypted: true }, 201);
      }
      const { type, name, value } = await c.req.json<{ type: ItemType; name: string; value: string }>();
      if ((type !== 'password' && type !== 'api_key') || !name || !value) return c.json({ error: '需要 type（password 或 api_key）、name、value' }, 400);
      const item = ctx.vault.addSecret(type, name, value);
      return c.json({ id: item.id, encrypted: true }, 201);
    } catch (e) {
      if (e instanceof QuotaError) return c.json(e.body, 413);
      throw e;
    }
  });

  api.get('/items/:id/content', async (c) => {
    if (!isStage(c)) return unauthorized(c);
    const f = await ctx.vault.readFile(c.req.param('id'));
    if (!f) return c.json({ error: '找不到' }, 404);
    return new Response(f.data, { headers: { 'content-type': 'application/octet-stream' } });
  });

  api.get('/usage', (c) => c.json(ctx.vault.usage()));

  // ---- what the AI may use
  api.get('/secrets', (c) => {
    if (!isAgent(c)) return unauthorized(c);
    const names = new Set(ctx.vault.list().filter((i) => i.type === 'api_key').map((i) => i.name));
    return c.json(Object.entries(POLICIES).filter(([n]) => names.has(n)).map(([name, p]) => ({ name, service: p.service, allowHosts: p.allowHosts })));
  });

  api.post('/call', async (c) => {
    if (!isAgent(c)) return unauthorized(c);
    const req = await c.req.json<CallRequest>();
    if (!req?.secret || !req.url) return c.json({ error: '需要 secret 與 url' }, 400);
    return c.json(await callApi(ctx, req));
  });

  // ---- grants
  api.get('/grants', (c) => c.json(allGrants().map((g) => grantView(g, isStage(c)))));
  api.get('/grants/:id', (c) => {
    const g = getGrant(ctx, c.req.param('id'));
    return g ? c.json(grantView(g, isStage(c))) : c.json({ error: '找不到授權單' }, 404);
  });
  const phoneOrGrantToken = (c: Context, g: GrantRow) => isPhone(c) || same(c.req.query('token'), g.token);
  api.post('/grants/:id/allow', (c) => {
    const g = getGrant(ctx, c.req.param('id'));
    if (!g) return c.json({ error: '找不到授權單' }, 404);
    if (!phoneOrGrantToken(c, g)) return unauthorized(c);
    return c.json(grantView(allowGrant(ctx, g)));
  });
  api.post('/grants/:id/deny', (c) => {
    const g = getGrant(ctx, c.req.param('id'));
    if (!g) return c.json({ error: '找不到授權單' }, 404);
    if (!phoneOrGrantToken(c, g)) return unauthorized(c);
    return c.json(grantView(denyGrant(ctx, g)));
  });
  api.post('/grants/:id/allow-stage', (c) => {
    if (!isStage(c)) return unauthorized(c);
    const g = getGrant(ctx, c.req.param('id'));
    if (!g) return c.json({ error: '找不到授權單' }, 404);
    return c.json(grantView(allowGrant(ctx, g)));
  });

  // ---- phone remote (Kyle's only page on stage)
  api.get('/remote', (c) => {
    if (!isPhone(c)) return unauthorized(c);
    const g = currentGrant();
    const body: Record<string, unknown> = { state: ctx.stage.state, locked: lockState(ctx.db).locked };
    if (g && g.status === 'pending') body.grant = grantView(g);
    return c.json(body);
  });

  // ---- evidence
  api.get('/evidence', (c) => {
    const keys = ctx.vault.secretValues(['api_key']).map((s) => s.value).filter((v) => v.length >= 8);
    const given = mcpContents(ctx.db).some((t) => keys.some((k) => variants(k).some((v) => t.includes(v))));
    const n = countOutcomes(ctx.db);
    return c.json({ keyGivenToAi: given, sent: n.sent, blocked: n.blocked, denied: n.denied, recent: proxyLogs(ctx.db, 20) });
  });

  // ---- stage
  api.get('/stage', (c) => {
    const g = currentGrant();
    const body: Record<string, unknown> = { seq: ctx.stage.seq, state: ctx.stage.state, caption: ctx.stage.caption, ...counts() };
    if (g) body.grant = grantView(g);
    return c.json(body);
  });
  api.post('/stage/intro', (c) => {
    if (!isStage(c)) return unauthorized(c);
    ctx.stage.set('intro');
    return c.json({ ok: true });
  });

  api.post('/demo/reset', (c) => {
    const stage = isStage(c);
    if (!stage && !isAgent(c)) return unauthorized(c);
    ctx.db.transaction(() => {
      for (const t of ['grants', 'proxy_log', 'mcp_log']) ctx.db.prepare(`DELETE FROM ${t}`).run();
      const hasSandbox = ctx.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sandbox_log'").get();
      if (hasSandbox) ctx.db.prepare('DELETE FROM sandbox_log').run();
    })();
    if (stage) unlock(ctx.db);
    ctx.stage.reset();
    return c.json({ ok: true, locked: lockState(ctx.db).locked });
  });

  // ---- take everything back (#4)
  api.get('/lockdown', (c) => c.json(lockState(ctx.db)));
  const doLock = (c: Context) => {
    lock(ctx.db);
    ctx.stage.set('locked');
    return c.json({ locked: true });
  };
  api.post('/lockdown', (c) => (isPhone(c) ? doLock(c) : unauthorized(c)));
  api.post('/lockdown/stage', (c) => (isStage(c) ? doLock(c) : unauthorized(c)));
  api.post('/lockdown/unlock', (c) => {
    if (isStage(c)) return c.json(unlock(ctx.db));
    if (isAgent(c)) return c.json({ error: '只有主人能解鎖' }, 403);
    return unauthorized(c);
  });

  return api;
}

export { ITEM_TYPES };
