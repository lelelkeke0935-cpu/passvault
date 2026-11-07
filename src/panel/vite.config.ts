import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({clearScreen:false,root,base:'/',build:{outDir:root+'../../dist/panel',emptyOutDir:true,rollupOptions:{input:{index:root+'index.html',stage:root+'stage.html',m:root+'m.html',remote:root+'remote.html'}}},server:{host:'127.0.0.1',port:5177,proxy:{'/api':'http://127.0.0.1:8787'}}});
