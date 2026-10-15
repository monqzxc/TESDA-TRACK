import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The FastAPI backend, run with `uvicorn tesda_track.main:app --reload` (see the README). API_PROXY points it
    // elsewhere, e.g. http://host.docker.internal:8000 when this dev server runs in a container.
    proxy: {
      '/api': process.env.API_PROXY ?? 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Room for a page's code to be transformed the first time a test opens it (see src/test/setup.ts).
    testTimeout: 20_000,
    // Workers share one transform pipeline: on a 12-core machine, 11 workers took 46–50 seconds and 6 took 27–35.
    maxWorkers: '50%',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
