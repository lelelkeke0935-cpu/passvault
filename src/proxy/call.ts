import type { Ctx } from '../core/context.ts';
import { randomId, randomToken, sha256 } from '../core/crypto.ts';
import { now } from '../core/db.ts';
import { writeMcpLog, writeProxyLog } from '../core/logs.ts';
import { isLocked } from '../core/lockdown.ts';
import { decide, describe, POLICIES } from '../policy/rules.ts';
import { maskAll, scanRequest } from './leak.ts';

export interface CallRequest {
  secret: string;
  method: string;
  url: string;
  body?: unknown;
  grant?: string;
  agent?: string;
  caption?: string;
}

export interface PublicGrantRef {
  id: string;
  phoneUrl: string;
  summary: string;
}

export type CallResult =
  | { status: 'sent'; httpStatus: number; response: unknown }
  | { status: 'blocked'; reason: string; grant: PublicGrantRef }
  | { status: 'denied'; reason: string };

export interface GrantRow {
  id: string;
  agent: string;
  secret_name: string;
  summary: string;
  status: 'pending' | 'allowed' | 'denied' | 'used' | 'expired' | 'revoked';
  token: string;
  req_hash: string;
  created_at: string;
  expires_at: string;
  allowed_at: string | null;
  used_at: string | null;
}

const GRANT_TTL_MS = 5 * 60 * 1000;
export const REASON = {
  once: '授權只限一次',
  mismatch: '授權單不包含這個動作',
  expired: '授權已過期',
  rule: '規則不允許這個動作',
  leak: '請求內容含保險箱裡的祕密',
  locked: '保險箱已鎖住，所有授權已收回',
  refused: '主人拒絕了這次授權',
  host: '這把金鑰不能送到這個網址',
  missing: '保險箱裡沒有這把金鑰',
};

/** Stable JSON (sorted keys) so the same request always hashes the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function requestHash(secret: string, method: string, path: string, body: unknown): string {
  return sha256(canonical({ secret, method: method.toUpperCase(), path, body: body ?? null }));
}

export function getGrant(ctx: Ctx, id: string): GrantRow | undefined {
  return ctx.db.prepare('SELECT * FROM grants WHERE id = ?').get(id) as GrantRow | undefined;
}

function setGrantStatus(ctx: Ctx, id: string, status: GrantRow['status'], extra: Partial<Pick<GrantRow, 'allowed_at' | 'used_at'>> = {}): void {
  ctx.db
    .prepare('UPDATE grants SET status = ?, allowed_at = COALESCE(?, allowed_at), used_at = COALESCE(?, used_at) WHERE id = ?')
    .run(status, extra.allowed_at ?? null, extra.used_at ?? null, id);
}

/** URL the AI may see: no token, so the AI cannot authorize itself. */
export function grantRef(ctx: Ctx, g: GrantRow): PublicGrantRef {
  return { id: g.id, phoneUrl: `${ctx.env.publicUrl}/m/grants/${g.id}`, summary: g.summary };
}

export async function callApi(ctx: Ctx, req: CallRequest): Promise<CallResult> {
  const agent = req.agent || 'ai';
  if (req.caption) ctx.stage.caption = req.caption;
  const result = await decideAndSend(ctx, req, agent);
  writeMcpLog(ctx.db, agent, req.caption, result);
  return result;
}

async function decideAndSend(ctx: Ctx, req: CallRequest, agent: string): Promise<CallResult> {
  const method = (req.method || 'GET').toUpperCase();
  let url: URL;
  try {
    url = new URL(req.url, ctx.env.publicUrl);
  } catch {
    return deny(ctx, agent, req.secret, method, String(req.url), REASON.host);
  }
  const path = url.pathname;
  const logBase = { agent, secret: req.secret, method, url: path };

  const policy = POLICIES[req.secret];
  const ownHosts = [new URL(ctx.env.publicUrl).host, `127.0.0.1:${ctx.env.port}`, `localhost:${ctx.env.port}`];
  if (!policy || !(ownHosts.includes(url.host) || policy.allowHosts.includes(url.hostname))) {
    return deny(ctx, agent, req.secret, method, path, policy ? REASON.host : REASON.rule);
  }

  // Order: locked? -> request carries a vault secret? -> rule and grant. Nothing blocked ever reaches the target.
  if (isLocked(ctx.db)) {
    const r = deny(ctx, agent, req.secret, method, path, REASON.locked);
    ctx.stage.set('locked');
    return r;
  }
  const leak = scanRequest(ctx, req, url);
  if (leak) return deny(ctx, agent, req.secret, method, path, REASON.leak);

  if (req.grant) {
    const g = getGrant(ctx, req.grant);
    if (!g || g.secret_name !== req.secret) return denyAfterGrant(ctx, logBase, REASON.mismatch, req.grant);
    if (g.status === 'pending') return { status: 'blocked', reason: '還在等你授權', grant: grantRef(ctx, g) };
    if (g.status === 'used') return denyAfterGrant(ctx, logBase, REASON.once, g.id);
    if (g.status === 'revoked') return denyAfterGrant(ctx, logBase, REASON.locked, g.id);
    if (g.status === 'denied') return denyAfterGrant(ctx, logBase, REASON.refused, g.id);
    if (g.status === 'expired' || Date.parse(g.expires_at) < Date.now()) {
      setGrantStatus(ctx, g.id, 'expired');
      return denyAfterGrant(ctx, logBase, REASON.expired, g.id);
    }
    if (g.req_hash !== requestHash(req.secret, method, path, req.body)) return denyAfterGrant(ctx, logBase, REASON.mismatch, g.id);
    // allowed, unexpired, same request: send once and burn the grant
    setGrantStatus(ctx, g.id, 'used', { used_at: now() });
    const sent = await send(ctx, req.secret, method, path + url.search, req.body);
    if ('status' in sent) return sent;
    writeProxyLog(ctx.db, { ...logBase, outcome: 'sent', grantId: g.id });
    ctx.stage.set('sent', g.id);
    return { status: 'sent', httpStatus: sent.httpStatus, response: sent.response };
  }

  const d = decide(req.secret, method, path, req.body);
  if (d.rule === 'deny') return deny(ctx, agent, req.secret, method, path, REASON.rule);
  if (d.rule === 'ask') {
    const g = createGrant(ctx, agent, req.secret, method, path, req.body, describe(d.label, path, req.body));
    const reason = `${d.label}要你授權`;
    writeProxyLog(ctx.db, { ...logBase, outcome: 'blocked', reason, grantId: g.id });
    ctx.stage.set('blocked', g.id);
    return { status: 'blocked', reason, grant: grantRef(ctx, g) };
  }
  const sent = await send(ctx, req.secret, method, path + url.search, req.body);
  if ('status' in sent) return sent;
  writeProxyLog(ctx.db, { ...logBase, outcome: 'sent' });
  if (sent.masked) ctx.stage.set('masked');
  return { status: 'sent', httpStatus: sent.httpStatus, response: sent.response };
}

function deny(ctx: Ctx, agent: string, secret: string, method: string, url: string, reason: string): CallResult {
  writeProxyLog(ctx.db, { agent, secret, method, url, outcome: 'denied', reason });
  return { status: 'denied', reason };
}

/** A refused grant moves the stage: first refusal plays "授權只限一次", a second one in a row is the AI trying again. */
function denyAfterGrant(ctx: Ctx, base: { agent: string; secret: string; method: string; url: string }, reason: string, grantId: string): CallResult {
  writeProxyLog(ctx.db, { ...base, outcome: 'denied', reason, grantId });
  if (reason !== REASON.locked) ctx.stage.set(ctx.stage.state === 'denied' || ctx.stage.state === 'retry' ? 'retry' : 'denied');
  return { status: 'denied', reason };
}

function createGrant(ctx: Ctx, agent: string, secret: string, method: string, path: string, body: unknown, summary: string): GrantRow {
  const created = new Date();
  const g: GrantRow = {
    id: randomId('g', 4),
    agent,
    secret_name: secret,
    summary,
    status: 'pending',
    token: randomToken(),
    req_hash: requestHash(secret, method, path, body),
    created_at: created.toISOString(),
    expires_at: new Date(created.getTime() + GRANT_TTL_MS).toISOString(),
    allowed_at: null,
    used_at: null,
  };
  ctx.db
    .prepare(
      'INSERT INTO grants (id, agent, secret_name, summary, status, token, req_hash, created_at, expires_at) VALUES (@id, @agent, @secret_name, @summary, @status, @token, @req_hash, @created_at, @expires_at)',
    )
    .run(g);
  return g;
}

async function send(ctx: Ctx, secret: string, method: string, pathAndQuery: string, body: unknown): Promise<{ httpStatus: number; response: unknown; masked: boolean } | CallResult> {
  const key = ctx.vault.secretValue(secret);
  if (!key) return { status: 'denied', reason: REASON.missing };
  const init: RequestInit = { method, headers: { authorization: `Bearer ${key}` } };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  const res = await ctx.send(`http://127.0.0.1:${ctx.env.port}${pathAndQuery}`, init);
  const raw = await res.text();
  const text = maskAll(ctx, raw);
  let response: unknown = text;
  try {
    response = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: hand back the masked text */
  }
  return { httpStatus: res.status, response, masked: text !== raw };
}

export function allowGrant(ctx: Ctx, g: GrantRow): GrantRow {
  if (g.status === 'pending' && Date.parse(g.expires_at) >= Date.now() && !isLocked(ctx.db)) {
    setGrantStatus(ctx, g.id, 'allowed', { allowed_at: now() });
    ctx.stage.set('allowed', g.id);
  }
  return getGrant(ctx, g.id)!;
}

export function denyGrant(ctx: Ctx, g: GrantRow): GrantRow {
  if (g.status === 'pending') setGrantStatus(ctx, g.id, 'denied');
  return getGrant(ctx, g.id)!;
}
