import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  base: '/',
  build: {
    outDir: './dist'
  },
  plugins: [
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
