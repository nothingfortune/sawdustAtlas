/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // e2e/ holds Playwright specs (run via `pnpm test:e2e`); keep them out of vitest.
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/domain/**', 'src/storage.ts', 'src/data.ts', 'src/id.ts'],
      // Floor on the pure logic layer the test suite actually exercises. UI
      // components are not unit-tested yet (tracked separately); this gate guards
      // the geometry/persistence code where regressions are most costly.
      thresholds: { lines: 90, functions: 85, branches: 75, statements: 88 },
    },
  },
})
