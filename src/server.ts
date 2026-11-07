import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';

// One process serves the panel, the vault API, the phone pages and the test mail API.
// npm start runs from the package root, so static paths are relative to it.
const PANEL = './dist/panel';
const PORT = Number(process.env.PORT ?? 8787);

export const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

function page(file: string) {
  return (c: any) => {
    const path = `${PANEL}/${file}`;
    if (!existsSync(path)) return c.text('not built', 404);
    return c.html(readFileSync(path, 'utf8'));
  };
}

app.get('/stage', page('stage.html'));
app.get('/m/grants/:id', page('m.html'));
app.get('/m/remote', page('remote.html'));
app.use('/*', serveStatic({ root: PANEL }));

if (process.env.VITEST === undefined) {
  serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
    console.log(`PassVault listening on 127.0.0.1:${info.port}`);
  });
}
