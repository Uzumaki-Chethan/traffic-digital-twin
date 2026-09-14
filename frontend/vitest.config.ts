import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests for the pure data modules only (evalHistory, verdict); the
// UI itself is verified live against the backend, not rendered here.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/__tests__/**/*.test.ts'] },
})
