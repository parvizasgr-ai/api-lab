// Superadmin (müəllim) paneli: bütün istifadəçilər, qruplar, tapşırıq nəticələri və aktivlik.
// Yalnız oxu. Mənbələr: users, tasks + task_progress (nəticələr), request_log (API aktivliyi), audit_log (SQL Playground sorğuları).
import type { DB } from '../../db.js';
import { ApiError } from '../../errors.js';
import { offsetOf, orderBy, pageOf } from '../../lib/listing.js';

const SORT = {
  name: 'full_name',
  group: 'group_name',
  progress: 'done',
  lastLogin: 'last_login_at',
  createdAt: 'created_at',
  requests: 'requests',
};

// Hər istifadəçi üçün: tamamlanmış tapşırıqlar, API sorğuları, son sorğu, SQL Playground sorğuları
const SUMMARY_CTE = `
  WITH total AS (SELECT COUNT(*)::int AS n FROM tasks),
  prog AS (SELECT user_id, COUNT(*)::int AS done FROM task_progress GROUP BY user_id),
  act AS (SELECT user_id, COUNT(*)::int AS requests, MAX(created_at) AS last_request_at FROM request_log WHERE user_id IS NOT NULL GROUP BY user_id),
  sqlq AS (SELECT user_id, COUNT(*)::int AS sql_queries FROM audit_log WHERE action = 'SQL_QUERY' AND user_id IS NOT NULL GROUP BY user_id),
  summary AS (
    SELECT u.id, u.username, u.full_name, u.first_name, u.last_name, u.group_name, u.role, u.created_at, u.last_login_at,
           COALESCE(p.done, 0) AS done, t.n AS total, COALESCE(a.requests, 0) AS requests, a.last_request_at,
           COALESCE(s.sql_queries, 0) AS sql_queries
    FROM users u CROSS JOIN total t
    LEFT JOIN prog p ON p.user_id = u.id
    LEFT JOIN act a ON a.user_id = u.id
    LEFT JOIN sqlq s ON s.user_id = u.id
  )`;

interface SummaryRow {
  id: number;
  username: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  group_name: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
  done: number;
  total: number;
  requests: number;
  last_request_at: string | null;
  sql_queries: number;
}

const percent = (done: number, total: number) => (total ? Math.round((done * 100) / total) : 0);

const toSummary = (r: SummaryRow) => ({
  id: r.id,
  username: r.username,
  fullName: r.full_name,
  firstName: r.first_name,
  lastName: r.last_name,
  groupName: r.group_name,
  role: r.role,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
  progress: { done: r.done, total: r.total, percent: percent(r.done, r.total) },
  activity: { requests: r.requests, lastRequestAt: r.last_request_at, sqlQueries: r.sql_queries },
});

export interface UserFilter {
  group?: string;
  q?: string;
  role?: string;
  sort: string;
  page: number;
  size: number;
}

export class AdminUsersService {
  constructor(private db: DB) {}

  private where(f: UserFilter) {
    return {
      sql: `WHERE (@group::text IS NULL OR group_name = @group)
              AND (@role::text IS NULL OR role = @role)
              AND (@q::text IS NULL OR full_name ILIKE @like ESCAPE '\\' OR username ILIKE @like ESCAPE '\\')`,
      params: {
        group: f.group ?? null,
        role: f.role ?? null,
        q: f.q ?? null,
        like: f.q ? `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
      },
    };
  }

  async list(f: UserFilter) {
    const w = this.where(f);
    const total = (await this.db.prepare(`${SUMMARY_CTE} SELECT COUNT(*) FROM summary ${w.sql}`).pluck().get(w.params)) as number;
    const rows = (await this.db
      .prepare(`${SUMMARY_CTE} SELECT * FROM summary ${w.sql} ORDER BY ${orderBy(f.sort, SORT, 'id')} NULLS LAST LIMIT @limit OFFSET @offset`)
      .all({ ...w.params, limit: f.size, offset: offsetOf(f.page, f.size) })) as SummaryRow[];
    return pageOf(rows.map(toSummary), f.page, f.size, total);
  }

  // Qruplar üzrə xülasə (yalnız tələbələr — role USER)
  async groups() {
    const rows = (await this.db
      .prepare(
        `${SUMMARY_CTE}
         SELECT group_name, COUNT(*)::int AS students,
                COALESCE(ROUND(AVG(CASE WHEN total > 0 THEN done * 100.0 / total END)), 0)::int AS avg_percent,
                COUNT(*) FILTER (WHERE total > 0 AND done = total)::int AS completed_all,
                COUNT(*) FILTER (WHERE last_request_at >= to_char(now() AT TIME ZONE 'UTC' - interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))::int AS active_last_7_days
         FROM summary WHERE role = 'USER'
         GROUP BY group_name ORDER BY group_name NULLS LAST`,
      )
      .all()) as { group_name: string | null; students: number; avg_percent: number; completed_all: number; active_last_7_days: number }[];
    return {
      items: rows.map((r) => ({
        groupName: r.group_name,
        students: r.students,
        avgPercent: r.avg_percent,
        completedAll: r.completed_all,
        activeLast7Days: r.active_last_7_days,
      })),
    };
  }

  async detail(userId: number) {
    const row = (await this.db.prepare(`${SUMMARY_CTE} SELECT * FROM summary WHERE id = ?`).get(userId)) as SummaryRow | undefined;
    if (!row) throw new ApiError(404, 'USER_NOT_FOUND', 'İstifadəçi tapılmadı');
    const tasks = (await this.db
      .prepare(
        `SELECT t.id, t.lesson, t.title, t.method, t.path, t.expected_status, p.done_at
         FROM tasks t LEFT JOIN task_progress p ON p.task_id = t.id AND p.user_id = ?
         ORDER BY t.lesson, t.sort_order, t.id`,
      )
      .all(userId)) as { id: number; lesson: number; title: string; method: string; path: string; expected_status: number; done_at: string | null }[];
    const lessons = [1, 2, 3].map((lesson) => {
      const own = tasks.filter((t) => t.lesson === lesson);
      const done = own.filter((t) => t.done_at).length;
      return { lesson, done, total: own.length, percent: percent(done, own.length) };
    });
    const recentRequests = await this.db
      .prepare(`SELECT method, path, status, duration_ms AS "durationMs", created_at AS "createdAt" FROM request_log WHERE user_id = ? ORDER BY id DESC LIMIT 20`)
      .all(userId);
    const sqlQueries = ((await this.db
      .prepare(`SELECT details, created_at FROM audit_log WHERE user_id = ? AND action = 'SQL_QUERY' ORDER BY id DESC LIMIT 10`)
      .all(userId)) as { details: string; created_at: string }[]).map((r) => {
      const d = JSON.parse(r.details) as { sql: string; result: string; rowCount?: number };
      return { sql: d.sql, result: d.result, rowCount: d.rowCount ?? null, createdAt: r.created_at };
    });
    return {
      user: toSummary(row),
      lessons,
      tasks: tasks.map((t) => ({ id: t.id, lesson: t.lesson, title: t.title, method: t.method, path: t.path, expectedStatus: t.expected_status, done: t.done_at !== null, doneAt: t.done_at })),
      recentRequests,
      sqlQueries,
    };
  }

  // Nəticələr cədvəli (Excel/Google Sheets üçün CSV, UTF-8 BOM — Azərbaycan hərfləri düzgün açılsın)
  async resultsCsv(group?: string): Promise<string> {
    const rows = (await this.db
      .prepare(
        `${SUMMARY_CTE}
         SELECT s.*,
           (SELECT COUNT(*)::int FROM task_progress p JOIN tasks t ON t.id = p.task_id WHERE p.user_id = s.id AND t.lesson = 1) AS l1,
           (SELECT COUNT(*)::int FROM task_progress p JOIN tasks t ON t.id = p.task_id WHERE p.user_id = s.id AND t.lesson = 2) AS l2,
           (SELECT COUNT(*)::int FROM task_progress p JOIN tasks t ON t.id = p.task_id WHERE p.user_id = s.id AND t.lesson = 3) AS l3
         FROM summary s WHERE s.role = 'USER' AND (@group::text IS NULL OR s.group_name = @group)
         ORDER BY s.group_name NULLS LAST, s.full_name`,
      )
      .all({ group: group ?? null })) as (SummaryRow & { l1: number; l2: number; l3: number })[];
    const perLesson = (await this.db.prepare(`SELECT lesson, COUNT(*)::int AS n FROM tasks GROUP BY lesson`).all()) as { lesson: number; n: number }[];
    const of = (lesson: number) => perLesson.find((p) => p.lesson === lesson)?.n ?? 0;
    // CSV injection qoruması: =, +, -, @ ilə başlayan dəyərlər Excel-də formula kimi icra olunmasın
    const cell = (v: unknown) => {
      let s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['username', 'ad', 'soyad', 'qrup', 'qeydiyyat', 'son_giris', `ders1_(${of(1)})`, `ders2_(${of(2)})`, `ders3_(${of(3)})`, 'tamamlanib', 'cemi', 'faiz', 'api_sorgulari', 'sql_sorgulari'];
    const lines = rows.map((r) =>
      [r.username, r.first_name, r.last_name, r.group_name, r.created_at, r.last_login_at, r.l1, r.l2, r.l3, r.done, r.total, percent(r.done, r.total), r.requests, r.sql_queries].map(cell).join(','),
    );
    return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
  }
}
