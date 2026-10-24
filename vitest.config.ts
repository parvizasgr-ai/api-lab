import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global.ts'],
    setupFiles: ['tests/setup/each-file.ts'],
    testTimeout: 30_000,
    maxWorkers: 4, // hər worker-in öz PostgreSQL DB-ləri var (tests/setup/pg.ts)
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['server/src/**/*.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage/backend',
    },
  },
});
