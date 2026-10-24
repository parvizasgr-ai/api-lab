// ADMIN — material/tapşırıq idarəsi; SUPERADMIN (müəllim) — ADMIN-in hər şeyi + bütün istifadəçilər və nəticələri
export type Role = 'USER' | 'ADMIN' | 'SUPERADMIN';
export const isAdminRole = (role?: string) => role === 'ADMIN' || role === 'SUPERADMIN';

// Express Request-ə əlavə etdiyimiz sahələr.
import type { OperationInfo } from './openapi/spec.js';

export interface AuthContext {
  userId: number;
  username: string;
  role: Role;
  scopes: string[];
  via: 'bearer' | 'apiKey' | 'basic';
  jti?: string; // yalnız Bearer: logout bu token-i ləğv edir
  exp?: number;
}

export interface ValidatedRequest {
  params: Record<string, any>;
  query: Record<string, any>;
  headers: Record<string, any>;
  body: any;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      startedAt: number;
      auth?: AuthContext;
      operation?: OperationInfo;
      valid: ValidatedRequest;
    }
  }
}

export {};
