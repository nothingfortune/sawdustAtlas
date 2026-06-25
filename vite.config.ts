/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/domain/**', 'src/storage.ts', 'src/data.ts', 'src/id.ts'],
      // Floor on the pure logic layer the test suite actually exercises. UI
      // components are not unit-tested yet (tracked separately); this gate guards
      // the geometry/persistence code where regressions are most costly.
      thresholds: { lines: 88, functions: 82, branches: 70, statements: 85 },
    },
  },
})
