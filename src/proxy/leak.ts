import type { Ctx } from '../core/context.ts';
import type { CallRequest } from './call.ts';

// Leak guard (#9): mask vault secrets in anything handed to the AI, and refuse requests that smuggle one out.
// Five spellings of each secret; secrets shorter than 8 characters are skipped (too many false hits).

export const REDACTED = '▮▮▮▮';
const MIN = 8;

export function variants(secret: string): string[] {
  const b = Buffer.from(secret, 'utf8');
  const hex = b.toString('hex');
  return [...new Set([secret, b.toString('base64'), b.toString('base64url'), encodeURIComponent(secret), hex, hex.toUpperCase()])];
}

function vaultSecrets(ctx: Ctx): { name: string; value: string }[] {
  return ctx.vault.secretValues().filter((s) => s.value.length >= MIN);
}

export function maskText(text: string, secrets: string[]): string {
  let out = text;
  // longest first so a secret's encoding is not half-replaced by a shorter one
  const all = secrets.filter((s) => s.length >= MIN).flatMap(variants).sort((a, b) => b.length - a.length);
  for (const v of all) out = out.split(v).join(REDACTED);
  return out;
}

export function maskAll(ctx: Ctx, text: string): string {
  return maskText(text, vaultSecrets(ctx).map((s) => s.value));
}

/** Returns the secret name and spelling if the outgoing request carries one; checked before the vault injects its own key. */
export function scanRequest(ctx: Ctx, req: CallRequest, url: URL): { name: string; form: string } | null {
  const haystack = [url.toString(), req.body === undefined ? '' : JSON.stringify(req.body)].join('\n');
  for (const s of vaultSecrets(ctx)) {
    const forms = variants(s.value);
    const hit = forms.find((v) => haystack.includes(v));
    if (hit) return { name: s.name, form: ['原文', 'Base64', 'Base64url', '網址編碼', '十六進位', '十六進位'][forms.indexOf(hit)] ?? '其他' };
  }
  return null;
}
