// Konfiqurasiya: bütün parametrlər env dəyişənlərindən oxunur (12-factor app prinsipi).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// .env faylı varsa yüklənir (Node 20.12+ daxili funksiyası, dotenv paketi lazım deyil)
try {
  process.loadEnvFile(path.join(ROOT_DIR, '.env'));
} catch {
  // .env yoxdur — default dəyərlər işləyir
}

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  publicUrl: env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3000}`,
  dbPath: env.DB_PATH ?? path.join(ROOT_DIR, 'data', 'apilab.db'),
  migrationsDir: path.join(ROOT_DIR, 'db', 'migrations'),
  seedDir: path.join(ROOT_DIR, 'db', 'seed'),
  openapiJson: path.join(ROOT_DIR, 'openapi', 'openapi.json'),

  // JWT: HS256 (simmetrik açar). Production-da uzun, təsadüfi JWT_SECRET mütləqdir.
  jwtSecret: env.JWT_SECRET ?? 'apilab-dev-secret-change-me-0123456789abcdef',
  jwtIssuer: 'api-lab',
  accessTokenTtlSec: 15 * 60,
  refreshTokenTtlSec: 7 * 24 * 60 * 60,
  oauthCodeTtlSec: 60,

  // Dərs 2-də customers tokensiz işləyir; Dərs 3-də AUTH_CUSTOMERS=true → Bearer tələb olunur.
  authCustomers: env.AUTH_CUSTOMERS === 'true',

  // Musiqi: YOUTUBE_API_KEY varsa real YouTube Data API v3 axtarışı (nəticələr tracks-ə cache olunur)
  youtubeApiKey: env.YOUTUBE_API_KEY ?? '',
  fetch: globalThis.fetch as typeof fetch, // testlərdə əvəz olunur

  rateLimit: { limit: Number(env.RATE_LIMIT_PER_MIN ?? 60), windowSec: 60 },
  idempotencyTtlSec: 24 * 60 * 60,

  // Dərs materialları: fayllar web root-un XARİCİNDƏ saxlanılır (data/materials/)
  materials: {
    dir: env.MATERIALS_DIR ?? path.join(ROOT_DIR, 'data', 'materials'),
    slidesDir: path.join(ROOT_DIR, 'materials', 'slides'), // server qalxanda / materials:seed ilə avtomatik import
    maxUploadBytes: 50 * 1024 * 1024,
    convertTimeoutMs: 180_000,
    signedUrlTtlSec: 3600,
    // 'auto' — PATH-də axtarılır; testlərdə { soffice: null, pdftoppm: null } ilə söndürülür
    tools: 'auto' as 'auto' | { soffice: string | null; pdftoppm: string | null },
  },

  // SQL Playground: icra limiti, maks. sətir və nəticə ölçüsü
  sqlPlayground: { timeoutMs: 2000, maxRows: 200, maxBytes: 1_000_000 },

  // BFF-in hər daxili çağırışı üçün limit
  bffCallTimeoutMs: 3000,

  // X-Simulate tədris simulyatoru
  simulate: { enabled: env.SIMULATE_ENABLED !== 'false', slowMs: 3000, timeoutMs: 5000 },

  // Testlərdə vaxtı "dondurmaq" üçün (rate limit pəncərəsi, token ömrü)
  now: (): Date => new Date(),
};

export type Config = typeof config;
