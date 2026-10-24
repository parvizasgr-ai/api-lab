// materials/slides/ qovluğundakı faylların avtomatik importu (server qalxanda, npm run materials:seed, /_reset).
// Ad şablonu: *Ders1* / *Dərs1* / *Lesson1* → lesson 1. Artıq import olunmuş fayl (eyni ad) təkrar yüklənmir.
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../../db.js';
import { materialsRepo } from './repo.js';
import type { MaterialsService } from './service.js';

const ALLOWED = /\.(pdf|pptx|docx|md)$/i;

export const lessonFromName = (name: string): number | null => {
  const m = /(?:ders|dərs|lesson)[\s_-]*([123])(?!\d)/i.exec(name);
  return m ? Number(m[1]) : null;
};

export const titleFromName = (name: string) => path.parse(name).name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

export async function importSlides(db: DB, materials: MaterialsService, slidesDir: string) {
  if (!fs.existsSync(slidesDir)) return [];
  const admin = (await db.prepare(`SELECT id FROM users WHERE role IN ('ADMIN', 'SUPERADMIN') ORDER BY id LIMIT 1`).pluck().get()) as number | undefined;
  const imported: { file: string; id?: number; error?: string }[] = [];
  const files = fs.readdirSync(slidesDir).filter((f) => ALLOWED.test(f) && !f.startsWith('.')).sort();
  for (const [index, file] of files.entries()) {
    if (await materialsRepo.findByOriginalName(db, file)) continue;
    try {
      const lesson = lessonFromName(file);
      const m = await materials.create({ path: path.join(slidesDir, file), originalName: file, mime: 'application/octet-stream', move: false }, { title: titleFromName(file), lesson, sortOrder: index }, admin ?? null);
      if (lesson && m.kind === 'SLIDES') await materialsRepo.linkTasks(db, m.id, lesson); // dərs tapşırıqları bu slaydlara bağlanır
      imported.push({ file, id: m.id });
    } catch (err) {
      imported.push({ file, error: (err as Error).message });
    }
  }
  return imported;
}
