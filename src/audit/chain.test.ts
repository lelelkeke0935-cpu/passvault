import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { GENESIS, chainHash, deriveAuditKey, verifyChain, type AuditRow, type ChainedRow } from './chain.ts';

const key = deriveAuditKey(randomBytes(32));

function build(rows: AuditRow[], k: Buffer | string = key): ChainedRow[] {
  let prev = GENESIS;
  return rows.map((r) => {
    const hash = chainHash(prev, r, k);
    const out = { ...r, prevHash: prev, hash };
    prev = hash;
    return out;
  });
}

const base: AuditRow[] = [
  { id: 1, at: '2026-11-07T06:00:00Z', agent: 'claude-code', secret: 'SANDBOX_MAIL_KEY', method: 'GET', url: 'http://127.0.0.1:8787/sandbox/mail/whoami', outcome: 'sent' },
  { id: 2, at: '2026-11-07T06:00:05Z', agent: 'claude-code', secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: 'http://127.0.0.1:8787/sandbox/mail/lists/customers/send', outcome: 'blocked', reason: '寄給整份名單要你授權', grantId: 'g_1' },
  { id: 3, at: '2026-11-07T06:00:09Z', agent: 'claude-code', secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: 'http://127.0.0.1:8787/sandbox/mail/lists/customers/send', outcome: 'sent', grantId: 'g_1' },
  { id: 4, at: '2026-11-07T06:00:14Z', agent: 'claude-code', secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: 'http://127.0.0.1:8787/sandbox/mail/lists/customers/send', outcome: 'denied', reason: '授權只限一次', grantId: 'g_1' },
  { id: 5, at: '2026-11-07T06:00:20Z', agent: 'claude-code', secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: 'http://127.0.0.1:8787/sandbox/mail/lists/customers/send', outcome: 'denied', reason: '授權只限一次', grantId: 'g_1' },
];

describe('audit chain', () => {
  it('accepts an untouched chain and reports count and head', () => {
    const rows = build(base);
    expect(verifyChain(rows, key)).toEqual({ ok: true, count: 5, head: rows[4].hash.slice(0, 12) });
  });

  it('an empty log is ok with the genesis head (after /api/demo/reset)', () => {
    expect(verifyChain([], key)).toEqual({ ok: true, count: 0, head: '000000000000' });
  });

  it('first row chains from 64 zeros', () => {
    expect(build(base)[0].prevHash).toBe(GENESIS);
  });

  it.each(['id', 'at', 'agent', 'secret', 'method', 'url', 'outcome', 'reason', 'grantId'] as const)(
    'catches an edit to %s',
    (field) => {
      for (let i = 0; i < base.length; i++) {
        const rows = build(base);
        (rows[i] as any)[field] = `tampered-${field}`;
        expect(verifyChain(rows, key)).toMatchObject({ ok: false, count: 5, brokenAt: i + 1 });
      }
    },
  );

  it('catches an edited hash', () => {
    const rows = build(base);
    rows[2].hash = 'f'.repeat(64);
    expect(verifyChain(rows, key)).toMatchObject({ ok: false, brokenAt: 3 });
  });

  it('catches a deleted middle row at the position it left', () => {
    const rows = build(base);
    rows.splice(2, 1);
    expect(verifyChain(rows, key)).toMatchObject({ ok: false, count: 4, brokenAt: 3 });
  });

  it('catches two swapped rows', () => {
    const rows = build(base);
    [rows[1], rows[3]] = [rows[3], rows[1]];
    expect(verifyChain(rows, key)).toMatchObject({ ok: false, brokenAt: 2 });
  });

  it('cannot be rebuilt without the audit key', () => {
    const forged = build(base.map((r, i) => (i === 1 ? { ...r, outcome: 'sent' } : r)), 'guessed-key');
    expect(verifyChain(forged, key)).toMatchObject({ ok: false, brokenAt: 1 });
  });

  it('known limit: dropping the last row is not detected without an external head', () => {
    const rows = build(base).slice(0, 4);
    expect(verifyChain(rows, key).ok).toBe(true);
  });
});
