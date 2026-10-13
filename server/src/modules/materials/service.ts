// Materials: yükləmə, siyahı, viewer üçün səhifələr, endirmə, yenidən konvertasiya, silmə.
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import type { DB } from '../../db.js';
import type { Config } from '../../config.js';
import { ApiError, conflict, notFound } from '../../errors.js';
import { isoNow } from '../../lib/crypto.js';
import { writeAudit } from '../../lib/audit.js';
import type { AuthContext } from '../../types.js';
import { ConversionQueue } from './converter.js';
import { inspectFile, safeDisplayName, type MaterialExt } from './fileCheck.js';
import { materialsRepo, type MaterialKind, type MaterialRow } from './repo.js';
import { signPath, verifySignature } from './signing.js';
import { MaterialStorage } from './storage.js';

const DEFAULT_KIND: Record<MaterialExt, MaterialKind> = { pdf: 'SLIDES', pptx: 'SLIDES', docx: 'DOCUMENT', md: 'TASKSHEET' };
const VISIBLE_TO_STUDENTS = new Set(['READY', 'READY_NO_PREVIEW']);
const isAdmin = (auth?: AuthContext) => auth?.role === 'ADMIN';

export class MaterialsService {
  readonly storage: MaterialStorage;
  readonly queue: ConversionQueue;

  constructor(private ctx: { db: DB; config: Config }) {
    this.storage = new MaterialStorage(ctx.config);
    this.queue = new ConversionQueue(ctx.db, ctx.config, this.storage);
  }

  private get db() {
    return this.ctx.db;
  }

  private now() {
    return isoNow(this.ctx.config.now());
  }

  toMaterial(m: MaterialRow) {
    const base = `/api/v1/materials/${m.id}`;
    const hasPdf = m.status !== 'FAILED' && this.storage.pdfPath(m.stored_name) !== null;
    const hasPages = m.status === 'READY' && (m.page_count ?? 0) > 0;
    return {
      id: m.id,
      lesson: m.lesson,
      title: m.title,
      description: m.description,
      kind: m.kind,
      originalFilename: m.original_filename,
      mime: m.mime,
      sizeBytes: m.size_bytes,
      pageCount: m.page_count,
      status: m.status,
      errorMessage: m.error_message,
      uploadedBy: m.uploaded_by_username,
      sortOrder: m.sort_order,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      links: {
        self: base,
        pages: `${base}/pages`,
        download: signPath(this.ctx.config, `${base}/download`),
        pdf: hasPdf ? signPath(this.ctx.config, `${base}/pdf`) : null,
        thumbnail: hasPages ? signPath(this.ctx.config, `${base}/pages/1/thumb`) : null,
      },
    };
  }

  // Tələbə yalnız hazır materialları görür; ADMIN — hamısını (statusu izləmək üçün)
  private load(id: number, auth?: AuthContext): MaterialRow {
    const m = materialsRepo.get(this.db, id);
    if (!m || (auth && !isAdmin(auth) && !VISIBLE_TO_STUDENTS.has(m.status))) throw notFound('MATERIAL_NOT_FOUND', 'Material tapılmadı');
    return m;
  }

  list(auth: AuthContext, q: { lesson?: number; kind?: string; q?: string }) {
    return { items: materialsRepo.list(this.db, { ...q, readyOnly: !isAdmin(auth) }).map((m) => this.toMaterial(m)) };
  }

  get(auth: AuthContext, id: number) {
    return this.toMaterial(this.load(id, auth));
  }

  // Ümumi qəbul: həm HTTP upload, həm də materials/slides import-u bunu çağırır
  create(file: { path: string; originalName: string; mime: string; move: boolean }, meta: { title: string; description?: string; lesson?: number | null; kind?: MaterialKind; sortOrder?: number }, uploadedBy: number | null) {
    const checked = inspectFile(file.path, file.originalName, file.mime);
    const storedName = this.storage.newStoredName(checked.ext);
    this.storage.store(storedName, file.path, file.move);
    const id = materialsRepo.insert(this.db, {
      lesson: meta.lesson ?? null,
      title: meta.title,
      description: meta.description ?? null,
      kind: meta.kind ?? DEFAULT_KIND[checked.ext],
      original_filename: safeDisplayName(file.originalName),
      stored_name: storedName,
      mime: checked.mime,
      size_bytes: checked.size,
      uploaded_by: uploadedBy,
      sort_order: meta.sortOrder ?? 0,
      created_at: this.now(),
    });
    this.queue.enqueue(id);
    return materialsRepo.get(this.db, id)!;
  }

  upload(req: Request) {
    const f = req.file!;
    const body = req.valid.body;
    const m = this.create({ path: f.path, originalName: f.originalname, mime: f.mimetype, move: true }, body, req.auth!.userId);
    writeAudit(this.db, req, this.ctx.config.now(), { action: 'MATERIAL_UPLOADED', entity: 'materials', entityId: m.id, details: { originalFilename: m.original_filename, sizeBytes: m.size_bytes } });
    return this.toMaterial(m);
  }

  update(id: number, patch: { title?: string; description?: string | null; lesson?: number | null; kind?: MaterialKind; sortOrder?: number }) {
    const m = this.load(id);
    materialsRepo.update(this.db, id, {
      title: patch.title ?? m.title,
      description: patch.description === undefined ? m.description : patch.description,
      lesson: patch.lesson === undefined ? m.lesson : patch.lesson,
      kind: patch.kind ?? m.kind,
      sort_order: patch.sortOrder ?? m.sort_order,
      at: this.now(),
    });
    return this.toMaterial(materialsRepo.get(this.db, id)!);
  }

  private assertNotBusy(m: MaterialRow) {
    if (m.status === 'CONVERTING' || this.queue.isPending(m.id)) throw conflict('MATERIAL_BUSY', 'Material hazırda konvertasiya olunur — bitməsini gözləyin');
  }

  delete(req: Request, id: number) {
    const m = this.load(id);
    this.assertNotBusy(m);
    materialsRepo.delete(this.db, id);
    this.storage.remove(m.stored_name);
    writeAudit(this.db, req, this.ctx.config.now(), { action: 'MATERIAL_DELETED', entity: 'materials', entityId: id, details: { originalFilename: m.original_filename } });
  }

  reconvert(req: Request, id: number) {
    const m = this.load(id);
    this.assertNotBusy(m);
    this.db.transaction(() => {
      materialsRepo.replacePages(this.db, id, []);
      materialsRepo.setStatus(this.db, id, 'UPLOADED', this.now());
    })();
    fs.rmSync(this.storage.pagesDir(m.stored_name), { recursive: true, force: true });
    fs.rmSync(this.storage.convertedPdfPath(m.stored_name), { force: true });
    this.queue.enqueue(id);
    writeAudit(this.db, req, this.ctx.config.now(), { action: 'MATERIAL_RECONVERT', entity: 'materials', entityId: id });
    return this.toMaterial(materialsRepo.get(this.db, id)!);
  }

  pages(auth: AuthContext, id: number) {
    const m = this.load(id, auth);
    const base = `/api/v1/materials/${id}/pages`;
    const items = m.status === 'READY'
      ? materialsRepo.pages(this.db, id).map((p) => ({
          pageNo: p.page_no,
          imageUrl: signPath(this.ctx.config, `${base}/${p.page_no}/image`),
          thumbUrl: signPath(this.ctx.config, `${base}/${p.page_no}/thumb`),
        }))
      : [];
    return { materialId: id, status: m.status, items };
  }

  // Fayl endpoint-ləri: ya Bearer, ya da etibarlı pre-signed imza
  authorizeFile(req: Request) {
    if (req.auth) return;
    const { exp, sig } = req.valid.query as { exp?: number; sig?: string };
    if (!exp && !sig) throw new ApiError(401, 'UNAUTHORIZED', 'Bearer token və ya pre-signed URL (exp, sig) tələb olunur');
    if (!verifySignature(this.ctx.config, req.path, exp, sig)) throw new ApiError(401, 'INVALID_SIGNATURE', 'Pre-signed URL etibarsızdır və ya vaxtı keçib');
  }

  pageFile(req: Request, id: number, pageNo: number, variant: 'image' | 'thumb') {
    this.authorizeFile(req);
    const m = this.load(id, req.auth);
    const page = materialsRepo.page(this.db, id, pageNo);
    if (!page) throw notFound('PAGE_NOT_FOUND', 'Səhifə tapılmadı');
    return this.storage.pagePath(m.stored_name, variant === 'image' ? page.image_name : page.thumb_name);
  }

  original(req: Request, id: number) {
    this.authorizeFile(req);
    const m = this.load(id, req.auth);
    return { file: this.storage.originalPath(m.stored_name), name: m.original_filename, mime: m.mime };
  }

  pdf(req: Request, id: number) {
    this.authorizeFile(req);
    const m = this.load(id, req.auth);
    const file = this.storage.pdfPath(m.stored_name);
    if (!file) throw notFound('NO_PDF_VERSION', 'Bu materialın PDF versiyası yoxdur');
    return { file, name: `${path.parse(m.original_filename).name}.pdf` };
  }
}
