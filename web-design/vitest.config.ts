// Unit testlər (fetch mock) — brauzer mühiti happy-dom ilə. E2E testlər: e2e/ (Playwright).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://localhost:3000/' } },
    restoreMocks: true,
    // Unit coverage yalnız məntiq qatı üçün (lib/, api/); UI komponentləri (App.tsx) e2e ilə yoxlanır
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/api/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: '../coverage/web',
    },
  },
})
