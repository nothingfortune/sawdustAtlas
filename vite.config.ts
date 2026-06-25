/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // e2e/ holds Playwright specs (run via `pnpm test:e2e`); keep them out of vitest.
  test: { exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/e2e/**'] },
})
