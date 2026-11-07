import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

// #21 tamper-evident proxy_log. Pure functions; the caller stores prev_hash and hash per row.

export const GENESIS = '0'.repeat(64);

export type AuditRow = {
  id: number | string;
  at: string | number;
  agent: string;
  secret: string;
  method: string;
  url: string;
  outcome: string;
  reason?: string | null;
  grantId?: string | null;
};

export type ChainedRow = AuditRow & { prevHash: string; hash: string };

export type ChainResult = { ok: boolean; count: number; head: string; brokenAt?: number };

/** auditKey = HKDF-SHA256(vault key, info "passvault-audit"). */
export function deriveAuditKey(vaultKey: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', vaultKey, Buffer.alloc(0), 'passvault-audit', 32));
}

function canonical(row: AuditRow) {
  return JSON.stringify([
    row.id,
    row.at,
    row.agent,
    row.secret,
    row.method,
    row.url,
    row.outcome,
    row.reason ?? null,
    row.grantId ?? null,
  ]);
}

export function chainHash(prevHash: string, row: AuditRow, key: Buffer | string): string {
  return createHmac('sha256', key).update(prevHash + canonical(row)).digest('hex');
}

function same(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Rows must be in insertion order. brokenAt is the 1-based position of the first row
 * that does not chain (what the panel shows as 「第 N 筆紀錄被改過」).
 * Reports only; never blocks a write.
 */
export function verifyChain(rows: ChainedRow[], key: Buffer | string): ChainResult {
  let prev = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!same(row.prevHash, prev) || !same(row.hash, chainHash(prev, row, key))) {
      return { ok: false, count: rows.length, head: prev.slice(0, 12), brokenAt: i + 1 };
    }
    prev = row.hash;
  }
  return { ok: true, count: rows.length, head: prev.slice(0, 12) };
}
