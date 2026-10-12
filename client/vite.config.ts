import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api requests to the Express backend so the browser only talks to one origin.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    // Tests run in a fake browser (jsdom) so React components can render.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
