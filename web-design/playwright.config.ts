// E2E: real API Lab server (təzə müvəqqəti DB) + build olunmuş portal (web/dist), quraşdırılmış Google Chrome.
// Port 3000 — OAuth redirect_uri (http://localhost:3000/oauth/callback) seed-də bu porta qeydiyyatlıdır.
import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const runDir = path.join(os.tmpdir(), `apilab-e2e-${process.pid}`)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx server/src/index.ts',
    cwd: path.resolve(here, '..'),
    url: 'http://localhost:3000/api/v1/health',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: '3000',
      DB_PATH: path.join(runDir, 'e2e.db'),
      MATERIALS_DIR: path.join(runDir, 'materials'),
      RATE_LIMIT_PER_MIN: '1000', // ümumi limit testləri bloklamasın; 429 testi SQL Playground-un öz limiti (20/dəq) ilə
      MAX_UPLOAD_MB: '1', // 413 testi üçün kiçik limit (default 50 MB)
    },
  },
})
