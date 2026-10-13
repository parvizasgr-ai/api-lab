// CORS + təhlükəsizlik başlıqları (helmet).
import type { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Brauzerdəki JS (portal) bu cavab başlıqlarını oxuya bilsin deyə "expose" edirik.
const EXPOSED_HEADERS = [
  'X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After',
  'Location', 'ETag', 'Idempotent-Replayed', 'Deprecation', 'Sunset', 'Link', 'Allow', 'WWW-Authenticate',
];

export function security(): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https://i.ytimg.com', 'https://ui-avatars.com'],
          'frame-src': ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
          // OAuth consent formu POST-dan sonra client-in redirect_uri-sinə yönləndirir
          'form-action': ["'self'", 'http://localhost:*', 'https://oauth.pstmn.io'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
    // Lokal təlim mühiti: istənilən origin. preflightContinue — OPTIONS-u router özü cavablandırır (Allow başlığı ilə).
    cors({ origin: true, exposedHeaders: EXPOSED_HEADERS, preflightContinue: true }),
  ];
}
