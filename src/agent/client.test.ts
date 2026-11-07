import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, safeErrorMessage } from './client.ts';
import { startFakeVault, type FakeVault } from './fake-vault.test-support.ts';

describe('vault HTTP client', () => {
  let fake: FakeVault;
  beforeEach(async () => { fake = await startFakeVault(); });
  afterEach(async () => { await fake.close(); vi.unstubAllEnvs(); });

  it('reads metadata and uses the agent header on every request', async () => {
    expect(await fake.client.listSecrets()).toEqual([{ name: 'SANDBOX_MAIL_KEY', service: 'sandbox-mail', allowHosts: ['127.0.0.1'] }]);
    expect((await fake.client.getGrant('g_demo')).status).toBe('pending');
    expect(fake.requests.every((r) => r.authenticated && !r.ownerCredential)).toBe(true);
    expect(fake.requests.map((r) => r.path)).toEqual(['/api/secrets', '/api/grants/g_demo']);
  });

  it('does not expose server error bodies or malformed responses', async () => {
    fake.state.unsafeBody = randomUUID();
    fake.state.secretsStatus = 503;
    await expect(fake.client.listSecrets()).rejects.toMatchObject({ httpStatus: 503, message: '保險箱請求失敗（HTTP 503）。' });
    fake.state.secretsStatus = 200;
    fake.state.malformedSecrets = true;
    await expect(fake.client.listSecrets()).rejects.toThrow('保險箱回應格式不符 API 約定。');
    expect(safeErrorMessage(new Error(fake.state.unsafeBody)).includes(fake.state.unsafeBody)).toBe(false);
  });

  it('refuses redirects instead of forwarding the agent credential', async () => {
    await expect(fake.client.getGrant('redirect')).rejects.toMatchObject({ message: '無法完成保險箱請求，請檢查連線。', httpStatus: undefined });
    expect(fake.state.redirectTargetReached).toBe(false);
  });

  it('encodes grant identifiers and never follows them outside the API', async () => {
    await expect(fake.client.getGrant('../elsewhere?value=x')).rejects.toMatchObject({ httpStatus: 404 });
    expect(fake.requests.at(-1)?.path).toBe('/api/grants/..%2Felsewhere%3Fvalue%3Dx');
  });

  it('does not send requests with missing configuration or invalid tool input', () => {
    vi.stubEnv('PASSVAULT_URL', '');
    vi.stubEnv('PASSVAULT_AGENT_TOKEN', '');
    expect(() => createClient()).toThrow('請設定 PASSVAULT_URL 與 PASSVAULT_AGENT_TOKEN。');
    expect(() => createClient({ url: 'file:///tmp/vault', token: fake.token })).toThrow('HTTP 或 HTTPS');
    expect(() => fake.client.callApi({ secret: '', method: 'GET', url: 'not a URL' })).toThrow('參數格式');
    expect(fake.requests).toHaveLength(0);
  });

  it('supports request cancellation without exposing transport details', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createClient({ url: fake.url, token: fake.token, signal: controller.signal });
    await expect(client.listSecrets()).rejects.toThrow('操作已停止。');
  });
});
