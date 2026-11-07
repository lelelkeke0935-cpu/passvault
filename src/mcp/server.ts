import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { callInputSchema, createClient, safeErrorMessage, type VaultClient } from '../agent/client.ts';

export function createMcpServer(client: VaultClient = createClient({ agent: process.env.PASSVAULT_AGENT_NAME || 'claude-code' })): Server {
  const server = new Server({ name: 'passvault', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_secrets',
        description: '列出可使用的金鑰名稱、服務與允許的主機；不回傳金鑰內容。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'call_api',
        description: '請保險箱代送 API 請求。超出規則時先擋下，等待主人授權；金鑰不交給 AI。',
        inputSchema: {
          type: 'object',
          properties: {
            secret: { type: 'string', minLength: 1 },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] },
            url: { type: 'string', format: 'uri' },
            body: {},
            grant: { type: 'string', minLength: 1 },
            caption: { type: 'string', description: '用一句短話說明這一步要做什麼（例如「寄給 50 人」），會顯示在主人的舞台上。' },
          },
          required: ['secret', 'method', 'url'],
          additionalProperties: false,
        },
      },
    ],
  }));
  const failure = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] });
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      if (params.name === 'list_secrets') {
        if (Object.keys(params.arguments ?? {}).length) return failure('list_secrets 不接受參數。');
        return { content: [{ type: 'text', text: JSON.stringify(await client.listSecrets()) }] };
      }
      if (params.name === 'call_api') {
        const { caption, ...args } = (params.arguments ?? {}) as Record<string, unknown>;
        const input = callInputSchema.safeParse(args);
        if (!input.success) return failure('call_api 參數格式不正確。');
        const said = typeof caption === 'string' && caption.trim() ? caption.trim().slice(0, 24) : '使用保險箱呼叫 API';
        const result = await client.callApi(input.data, said);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      return failure('沒有這個工具。');
    } catch (error) {
      return failure(safeErrorMessage(error));
    }
  });
  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startMcpServer().catch((error: unknown) => {
    // stdout belongs exclusively to the MCP protocol.
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
