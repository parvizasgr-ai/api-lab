// Yüklənən faylın yoxlanılması — 3 qat (heç birinə təkbaşına güvənmək olmaz):
//   1. Uzantı allowlist-i      — .exe, .html, .svg və s. qəbul edilmir
//   2. MIME (client deyir)     — uzantıya uyğun olmalıdır (və ya ümumi application/octet-stream)
//   3. Magic bytes (məzmun)    — faylın ilk baytları formatın imzasıdır; "cv.pdf" adlı EXE burada tutulur
import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from '../../errors.js';

export type MaterialExt = 'pdf' | 'pptx' | 'docx' | 'md';

const TYPES: Record<MaterialExt, { mime: string; accepted: string[] }> = {
  pdf: { mime: 'application/pdf', accepted: ['application/pdf', 'application/x-pdf'] },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', accepted: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', accepted: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  md: { mime: 'text/markdown; charset=utf-8', accepted: ['text/markdown', 'text/x-markdown', 'text/plain'] },
};
const GENERIC_MIMES = ['application/octet-stream', ''];

const unsupported = (message: string, detail: string) => new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message, [{ field: 'file', message: detail }]);

// Orijinal ad yalnız göstərmək üçündür: qovluq hissəsi, idarəetmə simvolları atılır (../../etc/passwd → passwd)
export function safeDisplayName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = path.posix.basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (base || 'file').slice(0, 200);
}

export function inspectFile(filePath: string, originalName: string, declaredMime: string, allowed: MaterialExt[] = ['pdf', 'pptx', 'docx', 'md']) {
  const ext = path.extname(safeDisplayName(originalName)).slice(1).toLowerCase() as MaterialExt;
  if (!allowed.includes(ext)) throw unsupported(`İcazəli fayl tipləri: ${allowed.join(', ')}`, `Uzantı: .${ext || '(yoxdur)'}`);

  const mime = declaredMime.split(';')[0].trim().toLowerCase();
  if (!TYPES[ext].accepted.includes(mime) && !GENERIC_MIMES.includes(mime)) {
    throw unsupported(`MIME tipi .${ext} uzantısına uyğun deyil`, `Content-Type: ${mime}`);
  }

  const data = fs.readFileSync(filePath);
  const bad = (expected: string) => unsupported(`Faylın məzmunu .${ext} formatına uyğun deyil`, `Magic bytes: ${expected} gözlənilirdi`);
  if (ext === 'pdf' && data.subarray(0, 5).toString('latin1') !== '%PDF-') throw bad('%PDF-');
  if (ext === 'pptx' || ext === 'docx') {
    // Office Open XML = ZIP arxivi: PK\x03\x04 + [Content_Types].xml + ppt/ və ya word/ qovluğu
    const isZip = data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
    const part = ext === 'pptx' ? 'ppt/' : 'word/';
    if (!isZip || !data.includes('[Content_Types].xml') || !data.includes(part)) throw bad(`ZIP (PK\\x03\\x04) + [Content_Types].xml + ${part}`);
  }
  if (ext === 'md') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
      throw bad('UTF-8 mətn');
    }
    if (data.includes(0)) throw bad('UTF-8 mətn (NUL bayt olmadan)');
  }
  return { ext, mime: TYPES[ext].mime, size: data.length };
}
