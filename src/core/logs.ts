import { randomId } from './crypto.ts';
import { type DB, now } from './db.ts';

export type Outcome = 'sent' | 'blocked' | 'denied';

export interface ProxyLog {
  id: string;
  at: string;
  agent: string;
  secret: string;
  method: string;
  url: string;
  outcome: Outcome;
  reason?: string;
  grantId?: string;
}

interface ProxyLogRow {
  id: string;
  at: string;
  agent: string;
  secret: string;
  method: string;
  url: string;
  outcome: Outcome;
  reason: string | null;
  grant_id: string | null;
  prev_hash: string | null;
  hash: string | null;
}

/** Optional tamper-evidence hook (#21): given the previous hash and the new row, return this row's hash. */
export type ChainHasher = (prevHash: string, row: ProxyLog) => string;
let hasher: ChainHasher | null = null;
export function setChainHasher(h: ChainHasher | null): void {
  hasher = h;
}

export const GENESIS = '0'.repeat(64);

export function writeProxyLog(db: DB, entry: Omit<ProxyLog, 'id' | 'at'>): ProxyLog {
  const log: ProxyLog = { id: randomId('p', 6), at: now(), ...entry };
  const prev = (db.prepare('SELECT hash FROM proxy_log ORDER BY seq DESC LIMIT 1').get() as { hash: string | null } | undefined)?.hash ?? GENESIS;
  const hash = hasher ? hasher(prev, log) : null;
  db.prepare(
    'INSERT INTO proxy_log (id, at, agent, secret, method, url, outcome, reason, grant_id, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(log.id, log.at, log.agent, log.secret, log.method, log.url, log.outcome, log.reason ?? null, log.grantId ?? null, hasher ? prev : null, hash);
  return log;
}

export function toProxyLog(r: ProxyLogRow): ProxyLog {
  const log: ProxyLog = { id: r.id, at: r.at, agent: r.agent, secret: r.secret, method: r.method, url: r.url, outcome: r.outcome };
  if (r.reason) log.reason = r.reason;
  if (r.grant_id) log.grantId = r.grant_id;
  return log;
}

export function proxyLogs(db: DB, limit?: number): ProxyLog[] {
  const sql = limit ? 'SELECT * FROM proxy_log ORDER BY seq DESC LIMIT ?' : 'SELECT * FROM proxy_log ORDER BY seq ASC';
  const rows = (limit ? db.prepare(sql).all(limit) : db.prepare(sql).all()) as ProxyLogRow[];
  return rows.map(toProxyLog);
}

export function chainRows(db: DB): (ProxyLog & { prevHash: string | null; hash: string | null })[] {
  return (db.prepare('SELECT * FROM proxy_log ORDER BY seq ASC').all() as ProxyLogRow[]).map((r) => ({ ...toProxyLog(r), prevHash: r.prev_hash, hash: r.hash }));
}

export function countOutcomes(db: DB): Record<Outcome, number> {
  const out: Record<Outcome, number> = { sent: 0, blocked: 0, denied: 0 };
  for (const r of db.prepare('SELECT outcome, COUNT(*) AS n FROM proxy_log GROUP BY outcome').all() as { outcome: Outcome; n: number }[]) out[r.outcome] = r.n;
  return out;
}

/** Everything handed back to the AI, verbatim, so we can prove the key never reached it. */
export function writeMcpLog(db: DB, agent: string, caption: string | undefined, content: unknown): void {
  db.prepare('INSERT INTO mcp_log (at, agent, caption, content) VALUES (?, ?, ?, ?)').run(now(), agent, caption ?? null, JSON.stringify(content));
}

export function mcpContents(db: DB): string[] {
  return (db.prepare('SELECT content FROM mcp_log').all() as { content: string }[]).map((r) => r.content);
}
