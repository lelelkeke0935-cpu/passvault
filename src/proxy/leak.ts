import type { Ctx } from '../core/context.ts';
import { findSecrets, maskSecrets, type Finding, type Secret } from '../leak/scan.ts';
import type { CallRequest } from './call.ts';

// Leak guard (#9), wired to src/leak/scan.ts: mask vault secrets in anything handed to the AI,
// and refuse requests that smuggle one out. Runs before the vault injects its own key.

function vaultSecrets(ctx: Ctx): Secret[] {
  return ctx.vault.secretValues().map((s) => ({ name: s.name, value: s.value }));
}

export function maskAll(ctx: Ctx, text: string): string {
  return maskSecrets(text, vaultSecrets(ctx));
}

export function scanRequest(ctx: Ctx, req: CallRequest, url: URL): Finding | null {
  const haystack = [url.toString(), req.body === undefined ? '' : JSON.stringify(req.body)].join('\n');
  return findSecrets(haystack, vaultSecrets(ctx))[0] ?? null;
}

/** Did any API key reach the AI, in any of the five spellings? */
export function keyReachedAi(ctx: Ctx, contents: string[]): boolean {
  const keys = ctx.vault.secretValues(['api_key']).map((s) => ({ name: s.name, value: s.value }));
  return contents.some((t) => findSecrets(t, keys).length > 0);
}
