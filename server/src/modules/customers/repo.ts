// Müştərilər repo — klassik CRUD SQL-ləri: SELECT / INSERT / UPDATE / DELETE.
import type { DB } from '../../db.js';

export interface CustomerRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  active: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface CustomerFilter {
  city?: string;
  active?: boolean;
  q?: string;
}

function where(f: CustomerFilter) {
  const parts: string[] = [];
  if (f.city) parts.push('city = @city');
  if (f.active !== undefined) parts.push('active = @active');
  // LIKE-da % və _ xüsusi simvollardır — istifadəçi mətnində onları escape edirik.
  if (f.q) parts.push(`(first_name LIKE @q ESCAPE '\\' OR last_name LIKE @q ESCAPE '\\' OR email LIKE @q ESCAPE '\\')`);
  return {
    sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
    params: {
      city: f.city ?? null,
      active: f.active === undefined ? null : Number(f.active),
      q: f.q ? `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
    },
  };
}

export const customersRepo = {
  count(db: DB, f: CustomerFilter): number {
    const w = where(f);
    return db.prepare(`SELECT COUNT(*) FROM customers ${w.sql}`).pluck().get(w.params) as number;
  },

  list(db: DB, f: CustomerFilter, orderBy: string, limit: number, offset: number) {
    const w = where(f);
    return db
      .prepare(`SELECT * FROM customers ${w.sql} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`)
      .all({ ...w.params, limit, offset }) as CustomerRow[];
  },

  get: (db: DB, id: number) => db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as CustomerRow | undefined,

  insert: (db: DB, c: Omit<CustomerRow, 'id'>) =>
    Number(
      db
        .prepare(
          `INSERT INTO customers (first_name, last_name, email, phone, city, active, created_at, updated_at)
           VALUES (@first_name, @last_name, @email, @phone, @city, @active, @created_at, @updated_at)`,
        )
        .run(c).lastInsertRowid,
    ),

  update: (db: DB, c: Omit<CustomerRow, 'created_at'>) =>
    db
      .prepare(
        `UPDATE customers SET first_name = @first_name, last_name = @last_name, email = @email, phone = @phone,
                city = @city, active = @active, updated_at = @updated_at
         WHERE id = @id`,
      )
      .run(c),

  delete: (db: DB, id: number) => db.prepare(`DELETE FROM customers WHERE id = ?`).run(id).changes,
};
