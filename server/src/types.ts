// Express Request-ə əlavə etdiyimiz sahələr.
import type { OperationInfo } from './openapi/spec.js';

export interface AuthContext {
  userId: number;
  username: string;
  role: 'USER' | 'ADMIN';
  scopes: string[];
  via: 'bearer' | 'apiKey' | 'basic';
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
