// Konfiqurasiya: bütün parametrlər env dəyişənlərindən oxunur (12-factor app prinsipi).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_JWT_SECRET } from './lib/exposure.js';
import { EXTERNAL_CATALOG, type ExternalApi } from './modules/external/catalog.js';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// .env faylı varsa yüklənir (Node 20.12+ daxili funksiyası, dotenv paketi lazım deyil)
try {
  process.loadEnvFile(path.join(ROOT_DIR, '.env'));
} catch {
  // .env yoxdur — default dəyərlər işləyir
}

const env = process.env;

function parseTrustedProxies(value: string): string[] | false {
  const list = value.split(',').map((v) => v.trim()).filter(Boolean);
  return list.length === 0 || list.includes('none') ? false : list;
}

export const config = {
  port: Number(env.PORT ?? 3000),
  // Kim qoşula bilər: localhost — yalnız bu kompüter, həm 127.0.0.1, həm ::1 (default). Sinif/LAN: HOST=0.0.0.0 + güclü JWT_SECRET + ADMIN_PASSWORD
  host: env.HOST ?? 'localhost',
  // Verilibsə admin parolu hər başlanğıcda və /_reset-dən sonra bununla əvəz olunur (LAN rejimində məcburidir)
  adminPassword: env.ADMIN_PASSWORD ?? '',
  // Superadmin (müəllim): bütün istifadəçilər, qruplar və nəticələr. Hər başlanğıcda və DB sıfırlananda yaradılır/yenilənir.
  // npm run superadmin:init — güclü parol yaradıb .env-ə yazır.
  superadmin: {
    username: env.SUPERADMIN_USERNAME ?? '',
    password: env.SUPERADMIN_PASSWORD ?? '',
    name: env.SUPERADMIN_NAME ?? 'Müəllim',
  },
  publicUrl: env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3000}`,
  // PostgreSQL: tətbiq (sahib) rolu. SQL Playground ayrıca read-only rol ilə qoşulur (apilab_playground).
  databaseUrl: env.DATABASE_URL ?? 'postgres://apilab:apilab@localhost:5432/apilab',
  playgroundPassword: env.PLAYGROUND_DB_PASSWORD ?? 'apilab_playground',
  migrationsDir: path.join(ROOT_DIR, 'db', 'migrations'),
  seedDir: path.join(ROOT_DIR, 'db', 'seed'),
  openapiJson: path.join(ROOT_DIR, 'openapi', 'openapi.json'),
  webDist: env.WEB_DIST ?? path.join(ROOT_DIR, 'web', 'dist'), // portal build-i (web-design → pnpm build)

  // JWT: HS256 (simmetrik açar). Production-da uzun, təsadüfi JWT_SECRET mütləqdir.
  jwtSecret: env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
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
  // Brute-force qoruması: eyni username üçün N uğursuz login → pəncərə bitənə qədər 429 (sayğac rate_limit_counters-də)
  loginLockout: { maxFailures: Number(env.LOGIN_MAX_FAILURES ?? 10), windowSec: 300 },

  // X-Forwarded-For yalnız bu proxy-lərdən gələndə nəzərə alınır (Express "trust proxy").
  // Vergüllə: 'loopback', IP, CIDR (məs. "loopback,10.0.0.0/8"). Boş və ya 'none' → heç bir proxy-yə etibar yoxdur.
  trustedProxies: parseTrustedProxies(env.TRUSTED_PROXIES ?? 'loopback'),

  // CORS: icazəli origin-lər (vergüllə). Default — yalnız localhost/127.0.0.1 (istənilən port) və PUBLIC_URL. '*' → hamısı.
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  idempotencyTtlSec: 24 * 60 * 60,

  // Dərs materialları: fayllar web root-un XARİCİNDƏ saxlanılır (data/materials/)
  materials: {
    dir: env.MATERIALS_DIR ?? path.join(ROOT_DIR, 'data', 'materials'),
    slidesDir: path.join(ROOT_DIR, 'materials', 'slides'), // server qalxanda / materials:seed ilə avtomatik import
    maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 50) * 1024 * 1024,
    convertTimeoutMs: 180_000,
    signedUrlTtlSec: 3600,
    // 'auto' — PATH-də axtarılır; testlərdə { soffice: null, pdftoppm: null } ilə söndürülür
    tools: 'auto' as 'auto' | { soffice: string | null; pdftoppm: string | null },
  },

  // External APIs (RapidAPI) proxy. Standart rejim: tələbə öz X-RapidAPI-Key başlığını göndərir (saxlanmır).
  // Server key yalnız EXTERNAL_SERVER_KEY_ENABLED=true olanda, yalnız Hard Limit-li API-lər və daxil olmuş istifadəçilər üçün ehtiyatdır.
  external: {
    serverKey: env.RAPIDAPI_KEY ?? '',
    serverKeyEnabled: env.EXTERNAL_SERVER_KEY_ENABLED === 'true',
    timeoutMs: 8000,
    maxResponseBytes: 1024 * 1024,
    cacheTtlSec: 60,
    catalog: EXTERNAL_CATALOG as ExternalApi[], // testlərdə əvəz olunur (verified:true + mock upstream)
  },

  // SQL Playground: icra limiti, maks. sətir və nəticə ölçüsü
  sqlPlayground: { timeoutMs: 2000, maxRows: 200, maxBytes: 1_000_000 },

  // Redis / Kafka / MongoDB simulyasiyaları (server/src/infra). Tədris üçün: keş TTL-ləri qısadır ki, tələbə vaxtın keçməsini görsün;
  // Kafka consumer-i mesajı bir az gec emal edir — portalda "lag" bir anlıq görünür.
  infra: {
    cacheTtlSec: { rates: 60, flights: 30 },
    consumerDelayMs: Number(env.KAFKA_CONSUMER_DELAY_MS ?? 1500),
    sandbox: { redisKeys: 50, redisValueChars: 512, kafkaRetention: 50, kafkaGroups: 10, kafkaValueBytes: 2048 },
  },

  // BFF-in hər daxili çağırışı üçün limit
  bffCallTimeoutMs: 3000,

  // X-Simulate tədris simulyatoru
  simulate: { enabled: env.SIMULATE_ENABLED !== 'false', slowMs: 3000, timeoutMs: 5000 },

  // Testlərdə vaxtı "dondurmaq" üçün (rate limit pəncərəsi, token ömrü)
  now: (): Date => new Date(),
};

export type Config = typeof config;
