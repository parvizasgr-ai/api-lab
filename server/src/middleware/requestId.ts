// X-Request-Id: hər sorğunun unikal ID-si. Client göndərsə — onu istifadə edirik (distributed tracing),
// yoxdursa yaradırıq. Xəta cavabında traceId ilə eynidir.
import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

const VALID_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && VALID_ID.test(incoming) ? incoming : `req_${crypto.randomBytes(6).toString('hex')}`;
  req.startedAt = performance.now();
  res.set('X-Request-Id', req.id);
  next();
};
