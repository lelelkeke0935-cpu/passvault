// Per-key action rules. The AI never chooses the rule; the vault matches the request against this table.

export type Rule = 'allow' | 'ask' | 'deny';

export interface ActionRule {
  label: string;
  method: string;
  /** Path pattern; `:id` matches one segment. */
  path: string;
  match?: (body: any) => boolean;
  rule: Rule;
}

export interface KeyPolicy {
  service: string;
  /** Hosts the key may be sent to (besides the vault's own host). */
  allowHosts: string[];
  actions: ActionRule[];
}

const recipients = (body: any): number => (Array.isArray(body?.to) ? body.to.length : body?.to ? 1 : 0);

export const POLICIES: Record<string, KeyPolicy> = {
  SANDBOX_MAIL_KEY: {
    service: '測試用寄信 API',
    allowHosts: ['127.0.0.1', 'localhost'],
    actions: [
      { label: '查詢目前使用的金鑰', method: 'GET', path: '/sandbox/mail/whoami', rule: 'allow' },
      { label: '寄給 1 位收件人', method: 'POST', path: '/sandbox/mail/send', match: (b) => recipients(b) === 1, rule: 'allow' },
      { label: '寄給多位收件人', method: 'POST', path: '/sandbox/mail/send', match: (b) => recipients(b) > 1, rule: 'ask' },
      { label: '寄給整份名單', method: 'POST', path: '/sandbox/mail/lists/:id/send', rule: 'ask' },
      { label: '刪除名單', method: 'DELETE', path: '/sandbox/mail/lists/:id', rule: 'deny' },
    ],
  },
};

function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.split('/');
  const a = path.split('/');
  return p.length === a.length && p.every((seg, i) => seg.startsWith(':') ? a[i] !== '' : seg === a[i]);
}

export interface Decision {
  rule: Rule;
  label: string;
}

export function decide(secret: string, method: string, path: string, body: unknown): Decision {
  const policy = POLICIES[secret];
  if (!policy) return { rule: 'deny', label: '這把金鑰沒有規則' };
  for (const a of policy.actions) {
    if (a.method === method.toUpperCase() && pathMatches(a.path, path) && (!a.match || a.match(body))) {
      return { rule: a.rule, label: a.label };
    }
  }
  return { rule: 'deny', label: '規則以外的動作' };
}

const LIST_SIZES: Record<string, number> = { customers: 50 };

/** Short, stage-sized summary of the action (no agent name: the panel adds who asked; "only once" is shown separately). */
export function describe(label: string, path: string, body: any): string {
  const list = path.match(/^\/sandbox\/mail\/lists\/([^/]+)\/send$/);
  if (list) {
    const id = decodeURIComponent(list[1]);
    return LIST_SIZES[id] ? `寄給 ${LIST_SIZES[id]} 人` : `寄給整份名單「${id}」`;
  }
  const n = recipients(body);
  return n > 1 ? `寄給 ${n} 人` : label;
}
