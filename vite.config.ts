import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

/** La home incrusta ficheros en su HTML (`<!-- incluir: ruta -->`) para que el
 *  SVG del hero herede los tokens y la fuente de la página: un <img> no puede. */
function incluirEnHome(): import('vite').Plugin {
  return {
    name: 'incluir-en-home',
    transformIndexHtml(html, ctx) {
      // ctx.filename llega con barras normales también en Windows: no usar path.sep.
      if (path.basename(ctx.filename) !== 'index.html' || /[\\/]app[\\/]index\.html$/.test(ctx.filename)) return html;
      return html.replace(/<!-- incluir: ([\w/.-]+) -->/g, (_, rel) => fs.readFileSync(path.resolve(rel), 'utf8'));
    },
  };
}

// La home muestra «v0.11»: se lee de package.json en build (spec § 3.6).
process.env.VITE_VINA_VERSION = JSON.parse(fs.readFileSync('package.json', 'utf8')).version.split('.').slice(0, 2).join('.');

export default defineConfig({
  base: '/',
  resolve: {
    // El Desktop del usuario es una Junction (C:\Users\...\Desktop →
    // D:\Desktop). Sin esto, vite lanzado desde la ruta C: resuelve los
    // módulos al realpath D: (fuera de su root) → "Pre-transform error:
    // Failed to load url /src/main.tsx (resolved id: D:/...)" y la app
    // nunca monta (cazado 2026-07-02 con el gate María @gpu-local).
    // Canonicalizar el root al realpath tampoco sirve: root D: + cwd C:
    // cruza drives y revienta el dep-optimizer (TypeError output.imports,
    // reproducido 2×). preserveSymlinks mantiene TODO en el spelling de
    // lanzamiento — consistente desde ambas rutas; desde D: es identidad
    // (node_modules es layout npm plano, sin symlinks que preservar).
    preserveSymlinks: true,
  },
  build: {
    outDir: './dist',
    rollupOptions: {
      input: {
        inicio: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
        es: fileURLToPath(new URL('./es/index.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          // All of Three.js in one chunk — splitting into separate chunks
          // (core/addons/webgpu) causes circular TDZ errors in production.
          if (id.includes('node_modules/three/')) return 'three';
        },
      },
    },
  },
  plugins: [
    serveWasmRaw(),
    incluirEnHome(),
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
