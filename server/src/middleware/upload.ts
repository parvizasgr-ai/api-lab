// multipart/form-data qəbulu (multer). Fayl əvvəlcə data/materials/tmp/-ə təsadüfi adla yazılır —
// client-in göndərdiyi ad heç vaxt fayl yolu kimi istifadə olunmur. Sorğu bitəndə tmp fayl qalıbsa silinir.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import type { Config } from '../config.js';

export function uploadParser(config: Config): RequestHandler {
  const tmpDir = path.join(path.resolve(config.materials.dir), 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: tmpDir,
      filename: (_req, _file, cb) => cb(null, `up_${crypto.randomBytes(12).toString('hex')}`),
    }),
    limits: { fileSize: config.materials.maxUploadBytes, files: 1, fields: 20, fieldSize: 20_000 },
  }).single('file');

  return (req, res, next) => {
    res.on('close', () => {
      if (req.file?.path) fs.rm(req.file.path, { force: true }, () => {});
    });
    upload(req, res, (err?: unknown) => {
      if (err) return next(err);
      // Validator faylı da "sahə" kimi görsün (sxemdə file: required, format: binary)
      if (req.file) req.body[req.file.fieldname] = req.file.originalname;
      next();
    });
  };
}
