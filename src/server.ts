import { serve } from '@hono/node-server';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.ts';

// Secrets come only from the environment (WDEV: ~/apps/passvault/shared/env). Nothing secret is printed.
const env = process.env;
const port = Number(env.PORT ?? 8787);
if (!env.VAULT_MASTER_PASSWORD) throw new Error('VAULT_MASTER_PASSWORD is not set');
if (!env.SANDBOX_MAIL_KEY) {
  env.SANDBOX_MAIL_KEY = randomBytes(24).toString('base64url');
  console.log(`SANDBOX_MAIL_KEY generated (starts ${env.SANDBOX_MAIL_KEY.slice(0, 4)}…)`);
}

const { app } = await createApp({
  dataDir: env.DATA_DIR ?? './data',
  masterPassword: env.VAULT_MASTER_PASSWORD,
  sandboxKey: env.SANDBOX_MAIL_KEY,
  publicUrl: env.PUBLIC_URL ?? `http://127.0.0.1:${port}`,
  port,
  agentToken: env.PASSVAULT_AGENT_TOKEN,
  stageToken: env.STAGE_TOKEN,
  phoneToken: env.PHONE_TOKEN,
});

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`PassVault listening on 127.0.0.1:${info.port}`);
});
