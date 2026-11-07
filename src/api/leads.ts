import { Hono, type Context } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import type { Ctx } from '../core/context.ts';
import { openText, randomId, seal } from '../core/crypto.ts';
import { now } from '../core/db.ts';

// Sign-ups from the event (Kyle 11-07): name, email, phone, use case — sealed with the vault key, readable only by the owner.

interface Lead {
  name: string;
  email: string;
  phone?: string;
  note?: string;
}

const LIMIT = { name: 60, email: 120, phone: 40, note: 400 };
const recent = new Map<string, number[]>(); // per-IP submit times, to slow down spam

function same(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function buildLeads(ctx: Ctx): Hono {
  ctx.db.exec('CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data_enc BLOB NOT NULL)');
  const api = new Hono();

  api.post('/', async (c: Context) => {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'local';
    const t = Date.now();
    const times = (recent.get(ip) ?? []).filter((x) => t - x < 10 * 60_000);
    if (times.length >= 5) return c.json({ error: '送出太多次了，請稍後再試' }, 429);
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '格式不正確' }, 400);
    }
    if (body.website) return c.json({ ok: true }); // honeypot field filled by bots
    const lead: Lead = { name: clean(body.name, LIMIT.name), email: clean(body.email, LIMIT.email) };
    const phone = clean(body.phone, LIMIT.phone);
    const note = clean(body.note, LIMIT.note);
    if (phone) lead.phone = phone;
    if (note) lead.note = note;
    if (!lead.name) return c.json({ error: '請填名字' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return c.json({ error: 'Email 格式不正確' }, 400);
    if (body.consent !== true) return c.json({ error: '請勾選同意聯絡' }, 400);
    times.push(t);
    recent.set(ip, times);
    ctx.db.prepare('INSERT INTO leads (id, created_at, data_enc) VALUES (?, ?, ?)').run(randomId('l', 6), now(), seal(ctx.vault.vaultKey, JSON.stringify(lead)));
    return c.json({ ok: true }, 201);
  });

  // Owner only (stage pass).
  api.get('/', (c: Context) => {
    if (!same(c.req.header('x-stage-token'), ctx.env.stageToken)) return c.json({ error: '需要通行碼' }, 401);
    const rows = ctx.db.prepare('SELECT id, created_at, data_enc FROM leads ORDER BY created_at').all() as { id: string; created_at: string; data_enc: Buffer }[];
    return c.json(rows.map((r) => ({ id: r.id, at: r.created_at, ...JSON.parse(openText(ctx.vault.vaultKey, r.data_enc)) })));
  });

  return api;
}
