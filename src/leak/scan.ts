// #9 leak scan. Pure functions; the caller decrypts the vault secrets, scans, then drops them.

export const MASK = '▮▮▮▮';
export const MIN_SECRET_LENGTH = 8;

export type SecretForm = 'raw' | 'base64' | 'base64url' | 'url' | 'hex';
export type Secret = { name: string; value: string };
export type Finding = { name: string; form: SecretForm };

/** The five spellings of a secret: raw, Base64, Base64url, URL-encoded, hex (lower and upper). */
export function variants(secret: string): { form: SecretForm; value: string }[] {
  const buf = Buffer.from(secret, 'utf8');
  const hex = buf.toString('hex');
  return [
    { form: 'raw', value: secret },
    { form: 'base64', value: buf.toString('base64') },
    { form: 'base64url', value: buf.toString('base64url') },
    { form: 'url', value: encodeURIComponent(secret) },
    { form: 'hex', value: hex },
    { form: 'hex', value: hex.toUpperCase() },
  ];
}

// Strings to look for, longest first. Base64 also matches without padding and without its
// last partial character, so it is still caught when encoded together with trailing text.
function patterns(secrets: Secret[]) {
  const out: { name: string; form: SecretForm; value: string }[] = [];
  const seen = new Set<string>();
  for (const s of secrets) {
    if (s.value.length < MIN_SECRET_LENGTH) continue;
    for (const v of variants(s.value)) {
      const forms = [v.value];
      if (v.form === 'base64' || v.form === 'base64url') {
        const bare = v.value.replace(/=+$/, '');
        forms.push(bare, bare.slice(0, Math.floor(Buffer.byteLength(s.value) / 3) * 4));
      }
      for (const value of forms) {
        if (value.length < MIN_SECRET_LENGTH || seen.has(value)) continue;
        seen.add(value);
        out.push({ name: s.name, form: v.form, value });
      }
    }
  }
  return out.sort((a, b) => b.value.length - a.value.length);
}

export function findSecrets(text: string, secrets: Secret[]): Finding[] {
  const found: Finding[] = [];
  for (const p of patterns(secrets)) {
    if (!text.includes(p.value)) continue;
    if (!found.some((f) => f.name === p.name && f.form === p.form)) found.push({ name: p.name, form: p.form });
  }
  return found;
}

export function maskSecrets(text: string, secrets: Secret[]): string {
  let out = text;
  for (const p of patterns(secrets)) out = out.split(p.value).join(MASK);
  return out;
}
