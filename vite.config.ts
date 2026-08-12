import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'out/**'],
    testTimeout: 15000,
  },
})
