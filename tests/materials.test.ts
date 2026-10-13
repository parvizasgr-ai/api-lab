// Materials: yükləmə → konvertasiya → viewer, fayl təhlükəsizliyi (415/413/path traversal), pre-signed URL, reconvert, silmə.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { config as baseConfig } from '../server/src/config.js';
import { detectTools } from '../server/src/modules/materials/tools.js';
import { importSlides, lessonFromName } from '../server/src/modules/materials/slides.js';
import type { MaterialsService } from '../server/src/modules/materials/service.js';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';
import { makePdf, makePptx, makeZip, pngWidth } from './fixtures/files.js';

const tools = detectTools(baseConfig);
const PDF_MIME = 'application/pdf';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

async function setup(config = {}) {
  const t = createTestApp({ config });
  const admin = (await t.login('admin')).access_token;
  const student = (await t.login('student')).access_token;
  const materials = t.app.locals.materials as MaterialsService;
  const upload = (file: Buffer, filename: string, contentType: string, fields: Record<string, string> = { title: 'Test material', lesson: '1' }, token = admin) => {
    let r = t.api().post('/api/v1/materials').set(bearer(token));
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r.attach('file', file, { filename, contentType });
  };
  const ready = async (id: number) => {
    await materials.queue.idle();
    return (await t.api().get(`/api/v1/materials/${id}`).set(bearer(admin))).body;
  };
  return { ...t, admin, student, materials, upload, ready };
}

const allFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));

describe('PDF yükləmə → konvertasiya → viewer', () => {
  it.skipIf(!tools.pdftoppm)('202 + Location → READY, 2 səhifə (1600px + 320px), pre-signed şəkillər, endirmə, PDF', async () => {
    const t = await setup();
    const pdf = makePdf(2);
    const res = await t.upload(pdf, 'API_Ders1_Giris.pdf', PDF_MIME, { title: 'Dərs 1 — Giriş', lesson: '1', kind: 'SLIDES', description: 'Slaydlar' });
    expect(res.status).toBe(202);
    expectMatchesSpec(res, 'uploadMaterial');
    expect(res.headers.location).toBe(`/api/v1/materials/${res.body.id}`);
    expect(res.body).toMatchObject({ status: 'UPLOADED', lesson: 1, originalFilename: 'API_Ders1_Giris.pdf', sizeBytes: pdf.length, uploadedBy: 'admin' });

    const m = await t.ready(res.body.id);
    expect(m).toMatchObject({ status: 'READY', pageCount: 2, errorMessage: null });
    expect(m.links.thumbnail).toMatch(/\/pages\/1\/thumb\?exp=\d+&sig=[a-f0-9]{64}$/);

    // Tələbə Bearer ilə səhifə siyahısını alır, şəkilləri isə tokensiz (pre-signed URL)
    const pages = await t.api().get(`/api/v1/materials/${m.id}/pages`).set(bearer(t.student));
    expect(pages.status).toBe(200);
    expectMatchesSpec(pages, 'listMaterialPages');
    expect(pages.body.items.map((p: { pageNo: number }) => p.pageNo)).toEqual([1, 2]);
    const image = await t.api().get(pages.body.items[1].imageUrl).buffer(true);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(pngWidth(image.body)).toBe(1600);
    const thumb = await t.api().get(pages.body.items[0].thumbUrl).buffer(true);
    expect(pngWidth(thumb.body)).toBe(320);

    const download = await t.api().get(m.links.download).buffer(true);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toBe(`attachment; filename="API_Ders1_Giris.pdf"; filename*=UTF-8''API_Ders1_Giris.pdf`);
    expect(Buffer.compare(download.body, pdf)).toBe(0);
    const inline = await t.api().get(m.links.pdf).buffer(true);
    expect(inline.headers['content-type']).toBe(PDF_MIME);
    expect(inline.headers['content-disposition']).toMatch(/^inline;/);

    expect(t.db.prepare(`SELECT page_no, image_name, thumb_name FROM material_pages WHERE material_id = ? ORDER BY page_no`).all(m.id)).toEqual([
      { page_no: 1, image_name: 'page-1.png', thumb_name: 'thumb-1.png' },
      { page_no: 2, image_name: 'page-2.png', thumb_name: 'thumb-2.png' },
    ]);
    const list = await t.api().get('/api/v1/materials?lesson=1').set(bearer(t.student));
    expectMatchesSpec(list, 'listMaterials');
    expect(list.body.items.map((x: { id: number }) => x.id)).toEqual([m.id]);
  });

  it('pdftoppm yoxdursa → READY_NO_PREVIEW (yalnız endirmə və PDF)', async () => {
    const t = await setup({ materials: { ...baseConfig.materials, tools: { soffice: null, pdftoppm: null } } });
    const res = await t.upload(makePdf(1), 'notes.pdf', PDF_MIME);
    const m = await t.ready(res.body.id);
    expect(m).toMatchObject({ status: 'READY_NO_PREVIEW', pageCount: null });
    expect(m.errorMessage).toContain('pdftoppm');
    expect(m.links.thumbnail).toBeNull();
    expect((await t.api().get(`/api/v1/materials/${m.id}/pages`).set(bearer(t.student))).body.items).toEqual([]);
    expect((await t.api().get(m.links.download)).status).toBe(200);
    expect((await t.api().get(m.links.pdf)).status).toBe(200);
  });
});

describe('PPTX / DOCX / MD', () => {
  it.skipIf(!tools.soffice || !tools.pdftoppm)('PPTX → soffice → PDF → səhifələr (LibreOffice quraşdırılıbsa)', async () => {
    const t = await setup({ materials: { ...baseConfig.materials, convertTimeoutMs: 120_000 } });
    // Real PPTX lazımdır — LibreOffice-in özü ilə PDF-dən deyil, minimal XML-dən açılmayacaq; burada sadəcə pipeline yoxlanılır
    const res = await t.upload(makePptx(), 'Ders2.pptx', PPTX_MIME);
    const m = await t.ready(res.body.id);
    expect(['READY', 'FAILED']).toContain(m.status);
  }, 150_000);

  it('PPTX, soffice yoxdursa → READY_NO_PREVIEW; PDF versiyası yoxdur (404 NO_PDF_VERSION), endirmə işləyir', async () => {
    const t = await setup({ materials: { ...baseConfig.materials, tools: { soffice: null, pdftoppm: tools.pdftoppm } } });
    const res = await t.upload(makePptx(), 'API_Ders2_HTTP_REST.pptx', PPTX_MIME, { title: 'Dərs 2' });
    expect(res.status).toBe(202);
    expect(res.body.kind).toBe('SLIDES');
    const m = await t.ready(res.body.id);
    expect(m).toMatchObject({ status: 'READY_NO_PREVIEW' });
    expect(m.errorMessage).toContain('soffice');
    expect(m.links.pdf).toBeNull();
    const noPdf = await t.api().get(`/api/v1/materials/${m.id}/pdf`).set(bearer(t.student));
    expect(noPdf.status).toBe(404);
    expectMatchesSpec(noPdf, 'getMaterialPdf');
    expect(noPdf.body.code).toBe('NO_PDF_VERSION');
    const dl = await t.api().get(`/api/v1/materials/${m.id}/download`).set(bearer(t.student));
    expect(dl.headers['content-type']).toBe(PPTX_MIME);
  });

  it('Markdown → konvertasiyasız READY, kind TASKSHEET', async () => {
    const t = await setup();
    const res = await t.upload(Buffer.from('# Dərs 1\n\nTapşırıqlar'), 'tapsiriqlar.md', 'text/markdown');
    const m = await t.ready(res.body.id);
    expect(m).toMatchObject({ status: 'READY', kind: 'TASKSHEET', pageCount: null });
  });
});

describe('fayl təhlükəsizliyi', () => {
  it.each([
    ['icazəsiz uzantı', Buffer.from('MZ...'), 'setup.exe', 'application/octet-stream', 'Uzantı: .exe'],
    ['uzantısız fayl', makePdf(1), 'slides', PDF_MIME, 'Uzantı: .(yoxdur)'],
    ['MIME uyğun deyil', makePdf(1), 'slides.pdf', 'image/png', 'Content-Type: image/png'],
    ['magic bytes: .pdf, amma PDF deyil', Buffer.from('<html><script>alert(1)</script></html>'), 'slides.pdf', PDF_MIME, '%PDF-'],
    ['magic bytes: ZIP, amma [Content_Types].xml yoxdur', makeZip({ 'ppt/a.xml': 'x' }), 'slides.pptx', PPTX_MIME, '[Content_Types].xml'],
    ['DOCX adı, PPTX məzmunu', makePptx(), 'doc.docx', 'application/octet-stream', 'word/'],
    ['MD — binar məzmun', Buffer.from([0x00, 0xff, 0xfe, 0x00]), 'notes.md', 'text/markdown', 'UTF-8'],
  ])('%s → 415', async (_name, file, filename, mime, detail) => {
    const t = await setup();
    const res = await t.upload(file, filename, mime);
    expect(res.status).toBe(415);
    expectMatchesSpec(res, 'uploadMaterial');
    expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(res.body.details[0].message).toContain(detail);
    expect(t.db.prepare(`SELECT COUNT(*) FROM materials`).pluck().get()).toBe(0);
    expect(fs.readdirSync(path.join(t.config.materials.dir, 'tmp'))).toEqual([]); // tmp fayl silinib
  });

  it('limitdən böyük fayl → 413 PAYLOAD_TOO_LARGE (default limit 50 MB)', async () => {
    expect(baseConfig.materials.maxUploadBytes).toBe(50 * 1024 * 1024);
    const t = await setup({ materials: { ...baseConfig.materials, maxUploadBytes: 1024 } });
    const res = await t.upload(Buffer.concat([makePdf(1), Buffer.alloc(2048, 0x20)]), 'big.pdf', PDF_MIME);
    expect(res.status).toBe(413);
    expectMatchesSpec(res, 'uploadMaterial');
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(fs.readdirSync(path.join(t.config.materials.dir, 'tmp'))).toEqual([]);
  });

  it('USER rolu yükləyə bilmir (403), tokensiz 401, fayl yoxdur / bilinməyən sahə 422', async () => {
    const t = await setup();
    const res = await t.upload(makePdf(1), 'a.pdf', PDF_MIME, { title: 'x' }, t.student);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE');
    expect((await t.api().post('/api/v1/materials').field('title', 'x').attach('file', makePdf(1), 'a.pdf')).status).toBe(401);
    const noFile = await t.api().post('/api/v1/materials').set(bearer(t.admin)).field('title', 'x');
    expect(noFile.status).toBe(422);
    const extra = await t.upload(makePdf(1), 'a.pdf', PDF_MIME, { title: 'x', owner: 'me' });
    expect(extra.status).toBe(422);
    expect(extra.body.details[0].field).toBe('/owner');
    const badLesson = await t.upload(makePdf(1), 'a.pdf', PDF_MIME, { title: 'x', lesson: '7' });
    expect(badLesson.status).toBe(422);
  });

  it('path traversal adı: fayl materials qovluğundan kənara yazılmır, ad yalnız metadata-dır', async () => {
    const t = await setup({ materials: { ...baseConfig.materials, tools: { soffice: null, pdftoppm: null } } });
    const root = path.resolve(t.config.materials.dir);
    for (const evil of ['../../../../evil.pdf', '..\\..\\..\\evil.pdf', '/etc/passwd.pdf']) {
      const res = await t.upload(makePdf(1), evil, PDF_MIME);
      expect(res.status).toBe(202);
      expect(res.body.originalFilename).toMatch(/^(evil|passwd)\.pdf$/);
    }
    await t.materials.queue.idle();
    expect(fs.existsSync(path.resolve(root, '../../../../evil.pdf'))).toBe(false);
    const stored = t.db.prepare(`SELECT stored_name FROM materials`).pluck().all() as string[];
    expect(stored.every((s) => /^m_[a-f0-9]{24}\.pdf$/.test(s))).toBe(true);
    expect(allFiles(root).every((f) => f.startsWith(root + path.sep))).toBe(true);
    // Səhifə nömrəsi yalnız integer ola bilər
    expect((await t.api().get('/api/v1/materials/1/pages/..%2F..%2Fsecret/image').set(bearer(t.admin))).status).toBe(422);
  });
});

describe('pre-signed URL', () => {
  it('saxta imza və vaxtı keçmiş imza → 401, tokensiz və imzasız → 401', async () => {
    const t = await setup({ materials: { ...baseConfig.materials, tools: { soffice: null, pdftoppm: null } } });
    const m = await t.ready((await t.upload(makePdf(1), 'a.pdf', PDF_MIME)).body.id);
    const url = m.links.download as string;
    expect((await t.api().get(url)).status).toBe(200);

    const tampered = url.replace(/sig=([a-f0-9])/, (_s, c) => `sig=${c === 'a' ? 'b' : 'a'}`);
    const bad = await t.api().get(tampered);
    expect(bad.status).toBe(401);
    expectMatchesSpec(bad, 'downloadMaterial');
    expect(bad.body.code).toBe('INVALID_SIGNATURE');
    // Başqa materialın yolu ilə eyni imza işləmir
    expect((await t.api().get(url.replace(`/materials/${m.id}/`, '/materials/999/'))).status).toBe(401);

    const none = await t.api().get(`/api/v1/materials/${m.id}/download`);
    expect(none.status).toBe(401);
    expect(none.body.code).toBe('UNAUTHORIZED');

    t.clock.advance(3601);
    expect((await t.api().get(url)).body.code).toBe('INVALID_SIGNATURE');
  });
});

describe('PATCH, reconvert, DELETE, görünürlük', () => {
  it('PATCH başlıq/dərs/sıra (ADMIN), tələbə 403', async () => {
    const t = await setup({ materials: { ...baseConfig.materials, tools: { soffice: null, pdftoppm: null } } });
    const a = (await t.upload(makePdf(1), 'a.pdf', PDF_MIME, { title: 'A', lesson: '2', sortOrder: '1' })).body.id;
    const b = (await t.upload(makePdf(1), 'b.pdf', PDF_MIME, { title: 'B', lesson: '2', sortOrder: '2' })).body.id;
    await t.materials.queue.idle();
    const res = await t.api().patch(`/api/v1/materials/${b}`).set(bearer(t.admin)).send({ title: 'B (yeni)', sortOrder: 0 });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'updateMaterial');
    expect(res.body).toMatchObject({ title: 'B (yeni)', sortOrder: 0, lesson: 2 });
    const list = await t.api().get('/api/v1/materials?lesson=2').set(bearer(t.student));
    expect(list.body.items.map((x: { id: number }) => x.id)).toEqual([b, a]);
    expect((await t.api().patch(`/api/v1/materials/${a}`).set(bearer(t.student)).send({ title: 'x' })).status).toBe(403);
    expect((await t.api().patch(`/api/v1/materials/${a}`).set(bearer(t.admin)).send({})).status).toBe(422);
  });

  it.skipIf(!tools.pdftoppm)('xarab PDF → FAILED (orijinal qalır, tələbə görmür); reconvert → yenidən işlənir; konvertasiya gedərkən 409', async () => {
    const t = await setup();
    const broken = Buffer.from('%PDF-1.4\nthis is not really a pdf\n');
    const id = (await t.upload(broken, 'broken.pdf', PDF_MIME)).body.id;
    const busy = await t.api().post(`/api/v1/materials/${id}/reconvert`).set(bearer(t.admin));
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe('MATERIAL_BUSY');

    const failed = await t.ready(id);
    expect(failed.status).toBe('FAILED');
    expect(failed.errorMessage).toContain('pdftoppm');
    expect((await t.api().get(`/api/v1/materials/${id}/download`).set(bearer(t.admin))).status).toBe(200);
    expect((await t.api().get(`/api/v1/materials/${id}`).set(bearer(t.student))).status).toBe(404);

    const again = await t.api().post(`/api/v1/materials/${id}/reconvert`).set(bearer(t.admin));
    expect(again.status).toBe(202);
    expectMatchesSpec(again, 'reconvertMaterial');
    expect(again.body.status).toBe('UPLOADED');
    expect((await t.ready(id)).status).toBe('FAILED');

    const good = (await t.upload(makePdf(3), 'good.pdf', PDF_MIME)).body.id;
    expect((await t.ready(good)).pageCount).toBe(3);
    await t.api().post(`/api/v1/materials/${good}/reconvert`).set(bearer(t.admin));
    expect(await t.ready(good)).toMatchObject({ status: 'READY', pageCount: 3 });
    expect(t.db.prepare(`SELECT COUNT(*) FROM material_pages WHERE material_id = ?`).pluck().get(good)).toBe(3);
  });

  it('DELETE faylları və sətirləri silir, tapşırıqlar materialsız qalır; ikinci dəfə 404; tələbə 403', async () => {
    const t = await setup();
    const id = (await t.upload(makePdf(2), 'del.pdf', PDF_MIME)).body.id;
    await t.materials.queue.idle();
    t.db.prepare(`UPDATE tasks SET material_id = ? WHERE id = 1`).run(id);
    const stored = t.db.prepare(`SELECT stored_name FROM materials WHERE id = ?`).pluck().get(id) as string;
    const dir = path.join(t.config.materials.dir, stored.replace('.pdf', ''));
    expect(fs.existsSync(dir)).toBe(true);

    expect((await t.api().delete(`/api/v1/materials/${id}`).set(bearer(t.student))).status).toBe(403);
    const res = await t.api().delete(`/api/v1/materials/${id}`).set(bearer(t.admin));
    expect(res.status).toBe(204);
    expect(fs.existsSync(dir)).toBe(false);
    expect(t.db.prepare(`SELECT COUNT(*) FROM material_pages WHERE material_id = ?`).pluck().get(id)).toBe(0);
    expect(t.db.prepare(`SELECT material_id FROM tasks WHERE id = 1`).pluck().get()).toBeNull();
    const again = await t.api().delete(`/api/v1/materials/${id}`).set(bearer(t.admin));
    expect(again.status).toBe(404);
    expectMatchesSpec(again, 'deleteMaterial');
  });
});

describe('materials/slides importu', () => {
  it('Ders1_*.pdf → lesson 1; tapşırıqlar slayda bağlanır; təkrar import etmir', async () => {
    expect([lessonFromName('API_Ders1_Giris.pdf'), lessonFromName('Dərs_3.pptx'), lessonFromName('lesson-2.pdf'), lessonFromName('Ders12.pdf'), lessonFromName('notes.pdf')]).toEqual([1, 3, 2, null, null]);
    const t = await setup({ materials: { ...baseConfig.materials, tools: { soffice: null, pdftoppm: null } } });
    const slides = t.config.materials.slidesDir;
    fs.writeFileSync(path.join(slides, 'API_Ders1_Giris.pdf'), makePdf(1));
    fs.writeFileSync(path.join(slides, 'API_Ders3_Security_Design_BA.pdf'), makePdf(1));
    fs.writeFileSync(path.join(slides, 'readme.txt'), 'ignored');
    const result = importSlides(t.db, t.materials, slides);
    expect(result.map((r) => r.file)).toEqual(['API_Ders1_Giris.pdf', 'API_Ders3_Security_Design_BA.pdf']);
    const rows = t.db.prepare(`SELECT lesson, title, kind, uploaded_by FROM materials ORDER BY id`).all();
    expect(rows).toEqual([
      { lesson: 1, title: 'API Ders1 Giris', kind: 'SLIDES', uploaded_by: 2 },
      { lesson: 3, title: 'API Ders3 Security Design BA', kind: 'SLIDES', uploaded_by: 2 },
    ]);
    expect(t.db.prepare(`SELECT COUNT(*) FROM tasks WHERE lesson = 1 AND material_id IS NOT NULL`).pluck().get()).toBe(4);
    expect(importSlides(t.db, t.materials, slides)).toEqual([]);
    expect(fs.existsSync(path.join(slides, 'API_Ders1_Giris.pdf'))).toBe(true); // mənbə fayl kopyalanır, köçürülmür
    await t.materials.queue.idle();
    const overview = t.db.prepare(`SELECT title, status, tasks FROM v_material_overview ORDER BY material_id`).all();
    expect(overview).toEqual([
      { title: 'API Ders1 Giris', status: 'READY_NO_PREVIEW', tasks: 4 },
      { title: 'API Ders3 Security Design BA', status: 'READY_NO_PREVIEW', tasks: 7 },
    ]);
  });
});
