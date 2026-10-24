// Materials endpoint-ləri. Fayllar res.sendFile ilə, açıq Content-Type və nosniff ilə verilir.
import type { Response } from 'express';
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import type { MaterialsService } from './service.js';

// RFC 6266: ASCII "fallback" + UTF-8 adı (Azərbaycan hərfləri üçün)
const disposition = (type: 'attachment' | 'inline', name: string) =>
  `${type}; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

function sendFile(res: Response, file: string, contentType: string, contentDisposition?: string) {
  res.set({ 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
  if (contentDisposition) res.set('Content-Disposition', contentDisposition);
  res.sendFile(file);
}

export function materialsHandlers(_ctx: AppContext, materials: MaterialsService): Handlers {
  return {
    listMaterials: async (req, res) => res.json(await materials.list(req.auth!, req.valid.query as any)),
    getMaterial: async (req, res) => res.json(await materials.get(req.auth!, req.valid.params.materialId)),
    uploadMaterial: async (req, res) => {
      const m = await materials.upload(req);
      res.status(202).location(m.links.self).json(m);
    },
    updateMaterial: async (req, res) => res.json(await materials.update(req.valid.params.materialId, req.valid.body)),
    deleteMaterial: async (req, res) => {
      await materials.delete(req, req.valid.params.materialId);
      res.status(204).end();
    },
    reconvertMaterial: async (req, res) => {
      const m = await materials.reconvert(req, req.valid.params.materialId);
      res.status(202).location(m.links.self).json(m);
    },
    listMaterialPages: async (req, res) => res.json(await materials.pages(req.auth!, req.valid.params.materialId)),
    getMaterialPageImage: async (req, res) => sendFile(res, await materials.pageFile(req, req.valid.params.materialId, req.valid.params.pageNo, 'image'), 'image/png'),
    getMaterialPageThumb: async (req, res) => sendFile(res, await materials.pageFile(req, req.valid.params.materialId, req.valid.params.pageNo, 'thumb'), 'image/png'),
    downloadMaterial: async (req, res) => {
      const f = await materials.original(req, req.valid.params.materialId);
      sendFile(res, f.file, f.mime, disposition('attachment', f.name));
    },
    getMaterialPdf: async (req, res) => {
      const f = await materials.pdf(req, req.valid.params.materialId);
      sendFile(res, f.file, 'application/pdf', disposition('inline', f.name));
    },
  };
}
