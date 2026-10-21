import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for the pure helpers in `lib/`. Pages and components are checked
// in the browser; these pin the logic that decides what the UI shows.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['lib/**/*.test.ts'],
  },
})
