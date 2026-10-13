// Tapşırıq faylının (markdown) parser-i. Format (README-də izah olunub):
//
//   # Dərs 2
//   ## Yeni müştəri yarat
//   - method: POST
//   - path: /api/v1/customers
//   - status: 201
//   - order: 1                    (opsional)
//   Təsvir mətni (markdown) ...
//   ```sql
//   SELECT * FROM customers ORDER BY id DESC LIMIT 1
//   ```
import { ApiError, type ErrorDetail } from '../../errors.js';
import { guardQuery } from '../sql/guard.js';

export interface ParsedTask {
  lesson: number;
  title: string;
  method: string;
  path: string;
  expectedStatus: number;
  sortOrder?: number;
  descriptionMd: string;
  sqlCheck: string | null;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function parseTaskMarkdown(text: string): ParsedTask[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const errors: ErrorDetail[] = [];
  const tasks: ParsedTask[] = [];
  let lesson: number | null = null;
  let current: { line: number; lesson: number | null; title: string; meta: Record<string, string>; desc: string[]; sql: string | null } | null = null;
  let fence: { lang: string; body: string[] } | null = null;

  const finish = () => {
    if (!current) return;
    const c = current;
    const where = `line ${c.line}`;
    const fail = (message: string) => errors.push({ field: where, message: `"${c.title}": ${message}` });
    const method = (c.meta.method ?? '').toUpperCase();
    const status = Number(c.meta.status);
    if (!c.lesson) fail('dərs təyin olunmayıb (əvvəlcə "# Dərs N" başlığı)');
    if (!METHODS.includes(method)) fail(`method ${METHODS.join('|')} olmalıdır`);
    if (!c.meta.path?.startsWith('/')) fail('path "/" ilə başlamalıdır');
    if (!Number.isInteger(status) || status < 100 || status > 599) fail('status 100–599 olmalıdır');
    if (c.sql) {
      try {
        guardQuery(c.sql, 200);
      } catch (err) {
        fail(`SQL yoxlaması yalnız SELECT ola bilər (${(err as ApiError).message})`);
      }
    }
    tasks.push({
      lesson: c.lesson ?? 0,
      title: c.title,
      method,
      path: c.meta.path ?? '',
      expectedStatus: status,
      sortOrder: c.meta.order ? Number(c.meta.order) : undefined,
      descriptionMd: c.desc.join('\n').trim(),
      sqlCheck: c.sql,
    });
    current = null;
  };

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (fence) {
      if (/^```\s*$/.test(line)) {
        if (fence.lang === 'sql' && current && current.sql === null) current.sql = fence.body.join('\n').trim();
        else current?.desc.push('```' + fence.lang, ...fence.body, '```');
        fence = null;
      } else fence.body.push(line);
      return;
    }
    const open = /^```(\w*)\s*$/.exec(line);
    if (open) {
      fence = { lang: open[1].toLowerCase(), body: [] };
      return;
    }
    const lessonHeader = /^#\s+(?:dərs|ders|lesson)\s*(\d+)\b/i.exec(line);
    if (lessonHeader) {
      finish();
      lesson = Number(lessonHeader[1]);
      if (![1, 2, 3].includes(lesson)) errors.push({ field: `line ${lineNo}`, message: 'Dərs nömrəsi 1, 2 və ya 3 olmalıdır' });
      return;
    }
    const taskHeader = /^##\s+(.+?)\s*$/.exec(line);
    if (taskHeader) {
      finish();
      current = { line: lineNo, lesson, title: taskHeader[1].slice(0, 200), meta: {}, desc: [], sql: null };
      return;
    }
    const meta = /^[-*]\s*(method|path|status|order)\s*:\s*(.+?)\s*$/i.exec(line);
    if (current && meta) {
      current.meta[meta[1].toLowerCase()] = meta[2].replace(/^`|`$/g, '');
      return;
    }
    current?.desc.push(line);
  });
  if (fence) errors.push({ field: 'EOF', message: 'Bağlanmamış ``` kod bloku' });
  finish();

  if (!tasks.length && !errors.length) errors.push({ field: 'file', message: 'Faylda heç bir "## Tapşırıq" tapılmadı' });
  if (errors.length) throw new ApiError(422, 'INVALID_TASK_FILE', 'Tapşırıq faylında xətalar var', errors);
  return tasks;
}
