// Xarici konvertasiya alətlərinin aşkarlanması:
//   soffice  (LibreOffice) — PPTX/DOCX → PDF
//   pdftoppm (poppler)     — PDF → səhifə şəkilləri
// Hər ikisi opsionaldır: yoxdursa material READY_NO_PREVIEW statusu ilə saxlanılır (yalnız endirmə).
import { spawnSync } from 'node:child_process';
import type { Config } from '../../config.js';

export interface Tools {
  soffice: string | null;
  pdftoppm: string | null;
}

function firstWorking(candidates: (string | undefined)[], args: string[]): string | null {
  for (const cmd of candidates) {
    if (!cmd) continue;
    const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 15_000 });
    if (!r.error) return cmd;
  }
  return null;
}

let cached: Tools | undefined;

export function detectTools(config: Config): Tools {
  if (config.materials.tools !== 'auto') return config.materials.tools;
  cached ??= {
    soffice: firstWorking(
      [process.env.SOFFICE_PATH, 'soffice', 'libreoffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice', 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'],
      ['--version'],
    ),
    pdftoppm: firstWorking([process.env.PDFTOPPM_PATH, 'pdftoppm'], ['-v']),
  };
  return cached;
}
