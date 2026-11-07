import { z } from 'zod';

const secretSchema = z.object({
  name: z.string(),
  service: z.string(),
  allowHosts: z.array(z.string()),
});

const grantSchema = z.object({
  id: z.string(),
  agent: z.string(),
  secretName: z.string(),
  summary: z.string(),
  status: z.enum(['pending', 'allowed', 'denied', 'used', 'expired', 'revoked']),
  createdAt: z.string(),
  expiresAt: z.string(),
  phoneUrl: z.string().url(),
});

export const callInputSchema = z.object({
  secret: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string().url(),
  body: z.unknown().optional(),
  grant: z.string().min(1).optional(),
}).strict();

const callResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('sent'), httpStatus: z.number().int(), response: z.unknown() }),
  z.object({
    status: z.literal('blocked'),
    reason: z.string(),
    grant: grantSchema.pick({ id: true, phoneUrl: true, summary: true }),
  }),
  z.object({ status: z.literal('denied'), reason: z.string() }),
]);

const stageSchema = z.object({
  seq: z.number(),
  state: z.enum(['idle', 'intro', 'masked', 'blocked', 'allowed', 'sent', 'denied', 'retry', 'locked']),
  caption: z.string(),
  blockedCount: z.number(),
  allowedCount: z.number(),
  grant: grantSchema.optional(),
});

export type Secret = z.infer<typeof secretSchema>;
export type Grant = z.infer<typeof grantSchema>;
export type CallInput = z.infer<typeof callInputSchema>;
export type CallResult = z.infer<typeof callResultSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type SecretType = 'password' | 'api_key';

/** Messages are deliberately static: never include response bodies, tokens or fetch errors. */
export class VaultError extends Error {
  constructor(message: string, readonly httpStatus?: number) {
    super(message);
    this.name = 'VaultError';
  }
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof VaultError ? error.message : '操作失敗，請檢查保險箱連線後再試。';
}

export interface ClientOptions {
  url?: string;
  token?: string;
  agent?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function createClient(options: ClientOptions = {}) {
  const configuredUrl = options.url ?? process.env.PASSVAULT_URL;
  const token = options.token ?? process.env.PASSVAULT_AGENT_TOKEN;
  if (!configuredUrl || !token?.trim()) {
    throw new VaultError('請設定 PASSVAULT_URL 與 PASSVAULT_AGENT_TOKEN。');
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password
      || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') throw new Error();
  } catch {
    throw new VaultError('PASSVAULT_URL 必須是保險箱的 HTTP 或 HTTPS 根網址。');
  }
  const agent = options.agent ?? 'vault-cli';

  async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    try {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 10_000);
      const response = await fetch(new URL(path, baseUrl), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'X-Agent-Token': token!,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // Never forward the agent credential to a redirect destination or retry a mutation.
        redirect: 'error',
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new VaultError(`保險箱請求失敗（HTTP ${response.status}）。`, response.status);
      }
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) throw new VaultError('保險箱回應格式不符 API 約定。');
      return parsed.data;
    } catch (error) {
      if (error instanceof VaultError) throw error;
      throw new VaultError(options.signal?.aborted ? '操作已停止。' : '無法完成保險箱請求，請檢查連線。');
    }
  }

  return {
    listSecrets: () => request('/api/secrets', z.array(secretSchema)),
    callApi: (input: CallInput, caption?: string): Promise<CallResult> => {
      const parsed = callInputSchema.safeParse(input);
      if (!parsed.success) throw new VaultError('API 呼叫參數格式不正確。');
      return request('/api/call', callResultSchema, { ...parsed.data, agent, ...(caption ? { caption } : {}) });
    },
    getGrant: (id: string): Promise<Grant> => {
      if (!id || id === '.' || id === '..') throw new VaultError('授權單識別碼不正確。');
      return request(`/api/grants/${encodeURIComponent(id)}`, grantSchema);
    },
    addSecret: (name: string, type: SecretType, value: string) =>
      request('/api/items', z.object({ id: z.string(), encrypted: z.literal(true) }), { type, name, value }),
    getStage: () => request('/api/stage', stageSchema),
    getLockdown: () => request('/api/lockdown', z.object({ locked: z.boolean(), at: z.union([z.string(), z.number()]).optional() })),
    resetDemo: () => request('/api/demo/reset', z.object({ ok: z.literal(true), locked: z.boolean() }), {}),
  };
}

export type VaultClient = ReturnType<typeof createClient>;

export const listSecrets = () => createClient().listSecrets();
export const callApi = (input: CallInput, caption?: string) => createClient().callApi(input, caption);
export const getGrant = (id: string) => createClient().getGrant(id);
