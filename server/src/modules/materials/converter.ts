// Asinxron konvertasiya — sadə in-process növbə, eyni anda 1 iş.
//   UPLOADED → CONVERTING → READY | READY_NO_PREVIEW | FAILED
// Xarici proqramlar execFile ilə çağırılır (shell YOXDUR, arqumentlər massivdir) və timeout-ları var.
// Yüklənən fayl heç vaxt icra olunmur — yalnız LibreOffice/poppler onu sənəd kimi oxuyur.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DB } from '../../db.js';
import type { Config } from '../../config.js';
import { isoNow } from '../../lib/crypto.js';
import { materialsRepo } from './repo.js';
import type { MaterialStorage } from './storage.js';
import { detectTools } from './tools.js';

function run(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`${path.basename(cmd)}: ${(stderr || err.message).toString().trim().slice(-500)}`));
      else resolve();
    });
  });
}

export class ConversionQueue {
  private chain: Promise<void> = Promise.resolve();
  private pending = new Set<number>();
  // DB reset olunanda artır: köhnə iş yeni yaranmış eyni id-li materiala yazmasın
  private generation = 0;

  constructor(
    private db: DB,
    private config: Config,
    private storage: MaterialStorage,
  ) {}

  isPending(id: number) {
    return this.pending.has(id);
  }

  enqueue(id: number) {
    if (this.pending.has(id)) return;
    this.pending.add(id);
    const gen = this.generation;
    this.chain = this.chain.then(() => (gen === this.generation ? this.convert(id, gen) : undefined)).finally(() => this.pending.delete(id));
  }

  reset() {
    this.generation++;
    this.pending.clear();
  }

  // Testlər və skriptlər üçün: növbə boşalana qədər gözlə
  idle(): Promise<void> {
    return this.chain;
  }

  private now() {
    return isoNow(this.config.now());
  }

  private async convert(id: number, gen: number): Promise<void> {
    const m = materialsRepo.get(this.db, id);
    if (!m) return;
    const setStatus: typeof materialsRepo.setStatus = (...args) => (gen === this.generation ? materialsRepo.setStatus(...args) : (undefined as never));
    setStatus(this.db, id, 'CONVERTING', this.now());
    try {
      const ext = path.extname(m.stored_name).slice(1);
      if (ext === 'md') {
        setStatus(this.db, id, 'READY', this.now()); // markdown birbaşa oxunur, şəkil lazım deyil
        return;
      }
      const tools = detectTools(this.config);
      const timeout = this.config.materials.convertTimeoutMs;

      if (ext === 'pptx' || ext === 'docx') {
        if (!tools.soffice) {
          setStatus(this.db, id, 'READY_NO_PREVIEW', this.now(), { error: 'LibreOffice (soffice) quraşdırılmayıb — yalnız endirmə mümkündür' });
          return;
        }
        const outDir = this.storage.dirOf(m.stored_name);
        // Ayrıca profil — istifadəçinin açıq LibreOffice-i ilə toqquşmasın
        const profile = pathToFileURL(path.join(os.tmpdir(), 'apilab-libreoffice-profile')).href;
        await run(tools.soffice, [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outDir, this.storage.originalPath(m.stored_name)], timeout);
        fs.renameSync(path.join(outDir, 'original.pdf'), this.storage.convertedPdfPath(m.stored_name));
      }

      const pdf = this.storage.pdfPath(m.stored_name);
      if (!pdf) throw new Error('PDF versiyası yaradılmadı');
      if (!tools.pdftoppm) {
        setStatus(this.db, id, 'READY_NO_PREVIEW', this.now(), { error: 'pdftoppm (poppler-utils) quraşdırılmayıb — yalnız endirmə mümkündür' });
        return;
      }

      const pagesDir = this.storage.pagesDir(m.stored_name);
      fs.rmSync(pagesDir, { recursive: true, force: true });
      fs.mkdirSync(pagesDir, { recursive: true });
      // -scale-to-x 1600 -scale-to-y -1: eni 1600px, hündürlük proporsional
      await run(tools.pdftoppm, ['-png', '-scale-to-x', '1600', '-scale-to-y', '-1', pdf, path.join(pagesDir, 'page')], timeout);
      await run(tools.pdftoppm, ['-png', '-scale-to-x', '320', '-scale-to-y', '-1', pdf, path.join(pagesDir, 'thumb')], timeout);

      // pdftoppm səhifə sayına görə sıfırla doldurur (page-01.png) — ardıcıl adlara çeviririk: page-1.png
      const numbered = (prefix: string) =>
        new Map(
          fs
            .readdirSync(pagesDir)
            .map((f) => [f, new RegExp(`^${prefix}-0*(\\d+)\\.png$`).exec(f)] as const)
            .filter(([, match]) => match)
            .map(([f, match]) => {
              const n = Number(match![1]);
              const target = `${prefix}-${n}.png`;
              if (f !== target) fs.renameSync(path.join(pagesDir, f), path.join(pagesDir, target));
              return [n, target] as const;
            }),
        );
      const images = numbered('page');
      const thumbs = numbered('thumb');
      const pages = [...images.keys()].sort((a, b) => a - b).map((n) => ({ page_no: n, image_name: images.get(n)!, thumb_name: thumbs.get(n) ?? images.get(n)! }));
      if (!pages.length) throw new Error('PDF-dən heç bir səhifə çıxarılmadı');

      if (gen !== this.generation) return;
      this.db.transaction(() => {
        materialsRepo.replacePages(this.db, id, pages);
        setStatus(this.db, id, 'READY', this.now(), { pageCount: pages.length });
      })();
    } catch (err) {
      setStatus(this.db, id, 'FAILED', this.now(), { error: (err as Error).message.slice(0, 1000) });
    }
  }
}
