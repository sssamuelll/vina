import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  build: {
    outDir: './dist'
  },
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // typedarray-pool (used by box-intersect → clean-pslg) does
      // require('buffer').Buffer which doesn't exist in browser.
      // The 'buffer' package is already installed via @react-three/fiber.
      buffer: 'buffer/',
    },
  },
  worker: {
    format: 'es',
  },
})
