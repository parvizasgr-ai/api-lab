// Design bölməsi (Google Stitch) endpoint-ləri. Hamısı Bearer; tələbə yalnız öz sessiya və işlərini görür.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { ApiError, forbidden } from '../../errors.js';
import { signPath, verifySignature } from '../materials/signing.js';
import { DESIGN_CSP } from './sanitize.js';
import type { DeviceType } from './service.js';

export function designHandlers({ design, config }: AppContext): Handlers {
  return {
    designUsage: async (req, res) => {
      res.json({ configured: design.configured, ...(await design.usage(req.auth!.userId)) });
    },
    designListSessions: async (req, res) => {
      res.json({ items: await design.listSessions(req.auth!.userId) });
    },
    designCreateSession: async (req, res) => {
      const body = (req.valid.body ?? {}) as { title?: string; deviceType?: DeviceType };
      const session = await design.createSession(req.auth!.userId, req.auth!.username, body);
      res.status(201).location(`/api/v1/design/sessions/${session.id}`).json(session);
    },
    designGetSession: async (req, res) => {
      res.json(await design.getSession(req.auth!.userId, req.valid.params.sessionId as string));
    },
    designDeleteSession: async (req, res) => {
      await design.deleteSession(req.auth!.userId, req.valid.params.sessionId as string);
      res.status(204).end();
    },
    // 202 Accepted: generasiya arxa planda gedir — Location-dakı job-u polling ilə izləyin
    designPostMessage: async (req, res) => {
      const job = await design.postMessage(req.auth!.userId, req.valid.params.sessionId as string, req.valid.body as { prompt: string; deviceType?: DeviceType });
      res.status(202).location(`/api/v1/design/jobs/${job.id}`).set('Retry-After', '4').json(job);
    },
    designGetJob: async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await design.getJob(req.auth!.userId, req.valid.params.jobId as string));
    },
    // HTML + imzalı preview URL. Portal iframe-ə srcdoc YOX, bu URL-i verir: srcdoc sənədi Callbox səhifəsinin CSP-sini miras alır
    // və Tailwind CDN-i bloklayırdı; ayrıca URL-in öz CSP-si var (Tailwind + Google Fonts, sandbox direktivi).
    designGetJobHtml: async (req, res) => {
      const result = (await design.getJob(req.auth!.userId, req.valid.params.jobId as string, true)) as { jobId: string; screenId: string | null; html: string };
      res.set('Cache-Control', 'no-store').json({ ...result, previewUrl: signPath(config, `/api/v1/design/preview/${result.jobId}`) });
    },
    // iframe src: <iframe> Authorization başlığı göndərə bilmir → imzalı, 1 saatlıq URL (materials pre-signed URL-ləri kimi)
    designPreview: async (req, res) => {
      const jobId = req.valid.params.jobId as string;
      const q = req.valid.query as { exp: number; sig: string };
      if (!verifySignature(config, `/api/v1/design/preview/${jobId}`, q.exp, q.sig)) {
        throw new ApiError(403, 'INVALID_SIGNATURE', 'Preview linki etibarsızdır və ya vaxtı keçib');
      }
      const html = await design.previewHtml(jobId);
      res
        .status(200)
        .set({
          // Sənəd həmişə sandbox-dadır (opaque origin) — birbaşa açılsa belə Callbox-un cookie/storage-inə çıxışı yoxdur
          'Content-Security-Policy': `${DESIGN_CSP}; frame-ancestors 'self'; sandbox allow-scripts`,
          'Cache-Control': 'private, max-age=600',
          'Referrer-Policy': 'no-referrer',
          'Cross-Origin-Resource-Policy': 'same-origin',
        })
        .type('html')
        .send(html);
    },
    adminDesignUsage: async (req, res) => {
      if (req.auth?.role !== 'SUPERADMIN') throw forbidden('Bu panel yalnız superadmin (müəllim) üçündür');
      res.json(await design.adminUsage());
    },
  };
}
