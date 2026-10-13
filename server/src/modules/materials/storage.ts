// Disk strukturu (DB-də yalnız stored_name saxlanılır, yollar ondan hesablanır):
//   <materials.dir>/<base>/original.<ext>     — yüklənən fayl
//   <materials.dir>/<base>/document.pdf       — PPTX/DOCX-in PDF versiyası
//   <materials.dir>/<base>/pages/page-N.png   — 1600px
//   <materials.dir>/<base>/pages/thumb-N.png  — 320px
// Bütün yollar materials.dir daxilində qalmalıdır (path traversal qorunması — əlavə qat).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../../config.js';

const STORED_NAME = /^m_[a-f0-9]{24}\.(pdf|pptx|docx|md)$/;

export class MaterialStorage {
  readonly root: string;
  constructor(config: Config) {
    this.root = path.resolve(config.materials.dir);
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  get tmpDir() {
    return path.join(this.root, 'tmp');
  }

  newStoredName(ext: string) {
    return `m_${crypto.randomBytes(12).toString('hex')}.${ext}`;
  }

  private inside(...parts: string[]) {
    const p = path.resolve(this.root, ...parts);
    if (!p.startsWith(this.root + path.sep)) throw new Error(`Yol materials qovluğundan kənardadır: ${p}`);
    return p;
  }

  dirOf(storedName: string) {
    if (!STORED_NAME.test(storedName)) throw new Error(`Etibarsız stored_name: ${storedName}`);
    return this.inside(storedName.replace(/\.[a-z]+$/, ''));
  }

  originalPath(storedName: string) {
    return path.join(this.dirOf(storedName), `original${path.extname(storedName)}`);
  }

  convertedPdfPath(storedName: string) {
    return path.join(this.dirOf(storedName), 'document.pdf');
  }

  pagesDir(storedName: string) {
    return path.join(this.dirOf(storedName), 'pages');
  }

  pagePath(storedName: string, fileName: string) {
    if (!/^(page|thumb)-\d+\.png$/.test(fileName)) throw new Error(`Etibarsız səhifə adı: ${fileName}`);
    return path.join(this.pagesDir(storedName), fileName);
  }

  // PDF versiyası: PDF-in özü və ya konvertasiya nəticəsi
  pdfPath(storedName: string): string | null {
    if (storedName.endsWith('.pdf')) return this.originalPath(storedName);
    const converted = this.convertedPdfPath(storedName);
    return fs.existsSync(converted) ? converted : null;
  }

  store(storedName: string, sourcePath: string, move: boolean) {
    fs.mkdirSync(this.dirOf(storedName), { recursive: true });
    if (move) fs.renameSync(sourcePath, this.originalPath(storedName));
    else fs.copyFileSync(sourcePath, this.originalPath(storedName));
  }

  remove(storedName: string) {
    fs.rmSync(this.dirOf(storedName), { recursive: true, force: true });
  }

  // DB reset-dən sonra: bütün material qovluqları silinir (tmp qalır)
  clear() {
    for (const entry of fs.readdirSync(this.root)) {
      if (entry !== 'tmp') fs.rmSync(this.inside(entry), { recursive: true, force: true });
    }
  }
}
