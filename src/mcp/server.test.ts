import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createClient } from '../agent/client.ts';
import { startFakeVault, type FakeVault } from '../agent/fake-vault.test-support.ts';
import { createMcpServer } from './server.ts';

describe('PassVault MCP', () => {
  let fake: FakeVault;
  const clients: Client[] = [];
  beforeEach(async () => { fake = await startFakeVault(); });
  afterEach(async () => { for (const client of clients.splice(0)) await client.close(); await fake.close(); });

  async function connect() {
    const server = createMcpServer(createClient({ url: fake.url, token: fake.token, agent: 'claude-code' }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    clients.push(client);
    await client.connect(clientTransport);
    return client;
  }

  it('offers exactly two tools and no reveal tool', async () => {
    const client = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['list_secrets', 'call_api']);
    const listed = await client.callTool({ name: 'list_secrets', arguments: {} });
    expect(listed.content).toEqual([{ type: 'text', text: JSON.stringify(await fake.client.listSecrets()) }]);
    expect((await client.callTool({ name: 'reveal_secret', arguments: {} })).isError).toBe(true);
  });

  it.each([
    { status: 'sent' as const, httpStatus: 201, response: { sent: 50 } },
    { status: 'blocked' as const, reason: '寄給整份名單要你授權', grant: { id: 'g_demo', phoneUrl: 'https://phone.example/m/grants/g_demo', summary: '寄給整份名單' } },
    { status: 'denied' as const, reason: '授權只限一次' },
  ])('returns the exact $status API outcome', async (result) => {
    const client = await connect();
    fake.callResults.push(result);
    const args = { secret: 'SANDBOX_MAIL_KEY', method: 'POST', url: 'http://127.0.0.1:8787/sandbox/mail/lists/customers/send', body: { subject: '測試', body: '測試' }, grant: 'g_demo' };
    const response = await client.callTool({ name: 'call_api', arguments: args });
    expect(response.content).toEqual([{ type: 'text', text: JSON.stringify(result) }]);
    expect(response.isError).not.toBe(true);
    expect(fake.calls[0]).toEqual({ ...args, agent: 'claude-code', caption: '使用保險箱呼叫 API' });
  });

  it('rejects invalid input and returns static errors for API failures', async () => {
    const client = await connect();
    expect((await client.callTool({ name: 'call_api', arguments: { secret: 'example' } })).isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
    fake.state.secretsStatus = 503;
    const result = await client.callTool({ name: 'list_secrets', arguments: {} });
    expect(result.content).toEqual([{ type: 'text', text: '保險箱請求失敗（HTTP 503）。' }]);
    expect(result.isError).toBe(true);
  });

  it('starts over real stdio using the pinned SDK with no stdout banners', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/mcp/server.ts'],
      env: { PASSVAULT_URL: fake.url, PASSVAULT_AGENT_TOKEN: fake.token },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    clients.push(client);
    await client.connect(transport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['list_secrets', 'call_api']);
    expect((await client.callTool({ name: 'list_secrets', arguments: {} })).isError).not.toBe(true);
    expect(stderr === '').toBe(true);
    expect(fake.requests.every((r) => r.authenticated && !r.ownerCredential)).toBe(true);
  });
});
