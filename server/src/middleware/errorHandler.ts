// Vahid error handler: hər xəta {timestamp, status, code, message, details, traceId} formatına çevrilir.
// Stack trace heç vaxt client-ə getmir — yalnız server konsoluna (traceId ilə) yazılır.
import type { ErrorRequestHandler, RequestHandler } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { ApiError, OAuthError } from '../errors.js';
import type { Config } from '../config.js';
import { isoNow } from '../lib/crypto.js';

export const routeNotFound: RequestHandler = (req) => {
  throw new ApiError(404, 'ROUTE_NOT_FOUND', `Endpoint tapılmadı: ${req.method} ${req.originalUrl.split('?')[0]}`);
};

export function errorHandler(config: Config): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    // Rədd edilmiş upload-un müvəqqəti faylı cavabdan ƏVVƏL silinir
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });

    if (err instanceof OAuthError) {
      res.status(err.status).type('application/json').set('Cache-Control', 'no-store');
      if (err.status === 401) res.set('WWW-Authenticate', 'Basic realm="API Lab OAuth"');
      res.json({ error: err.error, error_description: err.description });
      return;
    }

    let apiError: ApiError;
    if (err instanceof ApiError) {
      apiError = err;
    } else if (err instanceof multer.MulterError) {
      apiError =
        err.code === 'LIMIT_FILE_SIZE'
          ? new ApiError(413, 'PAYLOAD_TOO_LARGE', `Fayl çox böyükdür — maksimum ${Math.round(config.materials.maxUploadBytes / 1048576)} MB`)
          : new ApiError(422, 'VALIDATION_ERROR', 'Multipart sorğu sxemə uyğun deyil', [{ field: err.field ?? 'body', message: err.message }]);
    } else if (err?.type === 'entity.parse.failed') {
      apiError = new ApiError(400, 'MALFORMED_JSON', 'Request body düzgün JSON deyil', [{ field: 'body', message: err.message }]);
    } else if (err?.type === 'entity.too.large') {
      apiError = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body çox böyükdür (maks. 100 KB)');
    } else {
      console.error(`[${req.id}] Gözlənilməz xəta:`, err);
      apiError = new ApiError(500, 'INTERNAL_ERROR', 'Gözlənilməz xəta baş verdi. traceId ilə dəstəyə müraciət edin');
    }

    res
      .status(apiError.status)
      .type('application/json') // handler əvvəlcədən başqa tip təyin edibsə belə
      .set(apiError.headers)
      .json({
        timestamp: isoNow(config.now()),
        status: apiError.status,
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
        traceId: req.id,
      });
  };
}
