// Unit testlər (fetch mock) — brauzer mühiti happy-dom ilə. E2E testlər: e2e/ (Playwright).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://localhost:3000/' } },
    restoreMocks: true,
  },
})
