// CORS + təhlükəsizlik başlıqları (helmet).
import type { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Config } from '../config.js';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

// Origin icazəlidirmi? Origin-siz sorğular (Postman, curl, server-to-server) CORS-a aid deyil — həmişə keçir.
export function corsOriginAllowed(origin: string | undefined, config: Pick<Config, 'corsOrigins' | 'publicUrl'>): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes('*')) return true;
  if (config.corsOrigins.includes(origin)) return true;
  if (origin === new URL(config.publicUrl).origin) return true;
  return config.corsOrigins.length === 0 && LOCAL_ORIGIN.test(origin);
}

// Brauzerdəki JS (portal) bu cavab başlıqlarını oxuya bilsin deyə "expose" edirik.
const EXPOSED_HEADERS = [
  'X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After',
  'Location', 'ETag', 'Idempotent-Replayed', 'Deprecation', 'Sunset', 'Link', 'Allow', 'WWW-Authenticate',
];

export function security(config: Config): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'", 'data:'], // portal fontları lokaldır (@fontsource) — xarici font CDN-i yoxdur
          'img-src': ["'self'", 'data:', 'https://i.ytimg.com', 'https://ui-avatars.com'],
          'frame-src': ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'], // 'self' — Materials PDF viewer
          // OAuth consent formu POST-dan sonra client-in redirect_uri-sinə yönləndirir
          'form-action': ["'self'", 'http://localhost:*', 'https://oauth.pstmn.io'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
    // İcazəsiz origin-ə CORS başlıqları verilmir → brauzer cavabı JS-ə oxutmur. preflightContinue — OPTIONS-u router cavablandırır.
    cors({ origin: (origin, cb) => cb(null, corsOriginAllowed(origin, config)), exposedHeaders: EXPOSED_HEADERS, preflightContinue: true }),
  ];
}
