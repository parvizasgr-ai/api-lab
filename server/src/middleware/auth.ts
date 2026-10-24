// Autentifikasiya (kimsən?) və avtorizasiya (nəyə icazən var?) — endpoint-in OpenAPI `security` bölməsinə görə.
//   401 — kimliyi təsdiq olunmayıb (token yoxdur / etibarsızdır / vaxtı keçib)
//   403 — kimlik məlumdur, amma icazə yoxdur (scope çatışmır)
import type { Request, RequestHandler } from 'express';
import { ApiError } from '../errors.js';
import type { OperationInfo, OpenApiDoc } from '../openapi/spec.js';
import type { AuthService } from '../modules/auth/service.js';

const BEARER_SCHEMES = new Set(['bearerAuth', 'googleOAuth']);
// RFC 9110 §15.5.2: 401 cavabında WWW-Authenticate məcburidir (API key üçün standart sxem yoxdur — adət olunmuş forma)
const API_KEY_CHALLENGE = 'ApiKey realm="API Lab", header="X-API-Key"';

function unauthorized(code: string, message: string, challenge: string): ApiError {
  return new ApiError(401, code, message, [], { 'WWW-Authenticate': challenge });
}

export function authenticate(op: OperationInfo, spec: OpenApiDoc, auth: AuthService): RequestHandler {
  const requirements: Record<string, string[]>[] = op.operation.security ?? (spec as any).security ?? [];
  const schemes = new Set(requirements.flatMap((r) => Object.keys(r)));
  const anonymousAllowed = requirements.some((r) => Object.keys(r).length === 0);

  return async (req: Request, _res, next) => {
    if (!requirements.length) return next();
    const authorization = req.get('authorization') ?? '';

    if ([...schemes].some((s) => BEARER_SCHEMES.has(s)) && /^Bearer /i.test(authorization)) {
      try {
        req.auth = await auth.verifyAccessToken(authorization.slice(7).trim());
        return next();
      } catch (err) {
        const expired = (err as Error).message === 'TOKEN_EXPIRED';
        throw unauthorized(
          expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          expired ? 'Access token-in vaxtı keçib — /api/v1/auth/refresh istifadə edin' : 'Token etibarsızdır',
          `Bearer realm="API Lab", error="invalid_token"`,
        );
      }
    }

    const apiKey = req.get('x-api-key');
    if (schemes.has('apiKeyAuth') && apiKey) {
      const key = await auth.findActiveApiKey(apiKey);
      if (!key) throw unauthorized('INVALID_API_KEY', 'API key etibarsızdır və ya deaktiv edilib', API_KEY_CHALLENGE);
      req.auth = { userId: key.owner_user_id, username: key.username, role: key.role, scopes: [], via: 'apiKey' };
      return next();
    }

    if (schemes.has('basicAuth') && /^Basic /i.test(authorization)) {
      const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const user = sep > 0 ? await auth.verifyCredentials(decoded.slice(0, sep), decoded.slice(sep + 1)) : undefined;
      if (!user) throw unauthorized('INVALID_CREDENTIALS', 'Basic credential səhvdir', 'Basic realm="API Lab"');
      req.auth = { userId: user.id, username: user.username, role: user.role, scopes: [], via: 'basic' };
      return next();
    }

    if (anonymousAllowed) return next();

    if (schemes.has('basicAuth')) throw unauthorized('UNAUTHORIZED', 'Authorization: Basic başlığı yoxdur', 'Basic realm="API Lab"');
    if (schemes.has('apiKeyAuth') && ![...schemes].some((s) => BEARER_SCHEMES.has(s))) {
      throw unauthorized('UNAUTHORIZED', 'X-API-Key başlığı yoxdur', API_KEY_CHALLENGE);
    }
    throw unauthorized('UNAUTHORIZED', 'Authorization: Bearer <token> başlığı yoxdur', 'Bearer realm="API Lab"');
  };
}

// x-required-scopes: token-in "scope" claim-ində hamısı olmalıdır.
export function requireScopes(op: OperationInfo): RequestHandler {
  const required: string[] = op.operation['x-required-scopes'] ?? [];
  return (req, _res, next) => {
    if (!required.length) return next();
    const have = new Set(req.auth?.scopes ?? []);
    const missing = required.filter((s) => !have.has(s));
    if (missing.length) {
      throw new ApiError(403, 'INSUFFICIENT_SCOPE', `Bu əməliyyat üçün scope lazımdır: ${missing.join(', ')}`, [
        { field: 'scope', message: `Tələb olunur: ${missing.join(', ')}` },
      ]);
    }
    next();
  };
}
