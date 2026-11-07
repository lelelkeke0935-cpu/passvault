import { describe, expect, it } from 'vitest';
import { MASK, findSecrets, maskSecrets, variants } from './scan.ts';

// Fake values only. One with characters that change under URL encoding.
const KEY = 'sk_live_9fQ2xLmA7tRb';
const PW = 'Correct horse/battery+staple?>~';
const secrets = [
  { name: 'SANDBOX_MAIL_KEY', value: KEY },
  { name: 'gmail-password', value: PW },
];

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('variants', () => {
  it('returns raw, Base64, Base64url, URL-encoded and hex (lower and upper)', () => {
    const v = variants(PW);
    expect(v.map((x) => x.form)).toEqual(['raw', 'base64', 'base64url', 'url', 'hex', 'hex']);
    expect(v[1].value).toBe(b64(PW));
    expect(v[2].value).toBe(Buffer.from(PW).toString('base64url'));
    expect(v[3].value).toBe(encodeURIComponent(PW));
    expect(v[4].value).toBe(Buffer.from(PW).toString('hex'));
    expect(v[5].value).toBe(Buffer.from(PW).toString('hex').toUpperCase());
  });
});

describe('findSecrets', () => {
  it('finds the raw form', () => {
    expect(findSecrets(`{"auth":"Bearer ${KEY}"}`, secrets)).toEqual([{ name: 'SANDBOX_MAIL_KEY', form: 'raw' }]);
  });

  it('finds the Base64 form', () => {
    expect(findSecrets(`{"yourKeyB64":"${b64(KEY)}"}`, secrets)).toEqual([{ name: 'SANDBOX_MAIL_KEY', form: 'base64' }]);
  });

  it('finds Base64 even when encoded together with trailing text', () => {
    expect(findSecrets(b64(`${KEY} and more text`), secrets)).toEqual([{ name: 'SANDBOX_MAIL_KEY', form: 'base64' }]);
  });

  it('finds the Base64url form', () => {
    const v = Buffer.from(PW).toString('base64url');
    expect(v).not.toBe(b64(PW).replace(/=+$/, '')); // really differs from plain Base64
    expect(findSecrets(`?t=${v}`, secrets)).toEqual([{ name: 'gmail-password', form: 'base64url' }]);
  });

  it('finds the URL-encoded form', () => {
    expect(findSecrets(`https://x.test/?p=${encodeURIComponent(PW)}`, secrets)).toEqual([
      { name: 'gmail-password', form: 'url' },
    ]);
  });

  it('finds the hex form in both cases', () => {
    const hex = Buffer.from(KEY).toString('hex');
    expect(findSecrets(hex, secrets)).toEqual([{ name: 'SANDBOX_MAIL_KEY', form: 'hex' }]);
    expect(findSecrets(hex.toUpperCase(), secrets)).toEqual([{ name: 'SANDBOX_MAIL_KEY', form: 'hex' }]);
  });

  it('finds a vault password pasted into a mail body', () => {
    const body = JSON.stringify({ to: 'customer01@example.test', subject: 'hi', body: `密碼是 ${PW}` });
    expect(findSecrets(body, secrets)).toEqual([{ name: 'gmail-password', form: 'raw' }]);
  });

  it('skips secrets shorter than 8 characters, scans 8 and up', () => {
    expect(findSecrets('pin 1234567 here', [{ name: 'pin', value: '1234567' }])).toEqual([]);
    expect(findSecrets('pin 12345678 here', [{ name: 'pin', value: '12345678' }])).toEqual([{ name: 'pin', form: 'raw' }]);
  });

  it('known limit: a secret split into two pieces is not caught', () => {
    const text = JSON.stringify({ a: KEY.slice(0, 10), b: KEY.slice(10) });
    expect(findSecrets(text, secrets)).toEqual([]);
  });

  it('does not block the normal demo mails', () => {
    const demo = [
      'http://127.0.0.1:8787/sandbox/mail/whoami',
      JSON.stringify({ to: 'customer01@example.test', subject: 'PassVault 推庫', body: '您好，這是一封測試信。' }),
      'http://127.0.0.1:8787/sandbox/mail/lists/customers/send',
      JSON.stringify({ subject: '十一月新品通知', body: '親愛的客戶您好，本月新品已上架。' }),
      JSON.stringify({ subject: '再寄一次', body: '我再試試' }),
    ];
    for (const text of demo) expect(findSecrets(text, secrets)).toEqual([]);
  });
});

describe('maskSecrets', () => {
  it('masks every form, so whoami gives the AI only black bars', () => {
    const whoami = JSON.stringify({ yourKey: `Bearer ${KEY}`, yourKeyB64: b64(KEY) });
    const out = maskSecrets(whoami, secrets);
    expect(JSON.parse(out)).toEqual({ yourKey: `Bearer ${MASK}`, yourKeyB64: MASK });

    const all = variants(PW).map((v) => v.value).join(' | ');
    const masked = maskSecrets(all, secrets);
    expect(findSecrets(masked, secrets)).toEqual([]);
    expect(masked.split(MASK).length - 1).toBe(6);
  });

  it('leaves text without secrets unchanged', () => {
    expect(maskSecrets('{"messageId":"m_1"}', secrets)).toBe('{"messageId":"m_1"}');
  });
});
