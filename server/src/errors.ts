// Vahid xəta modeli. Handler-lər `throw new ApiError(...)` edir, errorHandler onu
// {timestamp, status, code, message, details, traceId} formatına çevirir.

export interface ErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: ErrorDetail[] = [],
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

// RFC 6749 §5.2 — yalnız OAuth token endpoint-i üçün ({error, error_description}).
export class OAuthError extends Error {
  constructor(
    public status: number,
    public error: string,
    public description: string,
  ) {
    super(description);
  }
}

export const notFound = (code: string, message: string) => new ApiError(404, code, message);
export const conflict = (code: string, message: string, details: ErrorDetail[] = []) =>
  new ApiError(409, code, message, details);
export const unprocessable = (code: string, message: string, details: ErrorDetail[] = []) =>
  new ApiError(422, code, message, details);
export const forbidden = (message = 'Bu resursa giriş icazəniz yoxdur', code = 'FORBIDDEN') =>
  new ApiError(403, code, message);
