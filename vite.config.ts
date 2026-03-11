import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/**
 * Serve wasm-bindgen JS files from public/wasm/ without Vite transform.
 * Vite's dev server transform middleware intercepts import() requests for
 * .js files and tries to process them as ESM modules — but wasm-bindgen
 * output uses patterns (import.meta.url, FinalizationRegistry) that fail
 * transformation, causing 500 errors. This plugin serves them as raw JS.
 */
function serveWasmRaw(): import('vite').Plugin {
  return {
    name: 'serve-wasm-raw',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url?.startsWith('/wasm/') && url.endsWith('.js')) {
          const filePath = path.join(process.cwd(), 'public', url);
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/',
  build: {
    outDir: './dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // GLTFLoader is always needed (default avatar) — keep in core
          if (id.includes('three/examples/jsm/loaders/GLTFLoader')) return 'three-core';
          // Other addons (exporters, FBX/OBJ loaders, IK, etc.) → deferred
          if (id.includes('three/examples/jsm')) return 'three-addons';
          if (id.includes('three/build/three.webgpu')) return 'three-webgpu';
          if (id.includes('node_modules/three/')) return 'three-core';
        },
      },
    },
  },
  plugins: [
    serveWasmRaw(),
    react(),
    nodePolyfills({
      // Only polyfill 'buffer' — needed by typedarray-pool (clean-pslg dep)
      include: ['buffer'],
      globals: { Buffer: true },
    }),
  ],
  define: {
    global: 'globalThis',
    __BUILD_TIMESTAMP__: JSON.stringify(Date.now().toString(36)),
  },
  worker: {
    format: 'es',
  },
})
