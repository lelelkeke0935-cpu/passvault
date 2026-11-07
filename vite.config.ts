import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every .html file in src/panel is one page; build output goes to dist/panel.
const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'src/panel');
const input = Object.fromEntries(
  readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), join(root, f)]),
);

const api = 'http://127.0.0.1:8787';
export default defineConfig({
  root,
  base: '/',
  build: { outDir: join(here, 'dist/panel'), emptyOutDir: true, rollupOptions: { input } },
  server: { proxy: { '/api': api, '/sandbox': api, '/healthz': api } },
});
