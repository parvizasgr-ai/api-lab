// Müştərilər — tam CRUD. Metodların semantikası:
//   GET    — safe + idempotent      POST   — nə safe, nə idempotent (hər dəfə yeni resurs)
//   PUT    — idempotent (tam əvəz)  PATCH  — qismən (yalnız göndərilən sahələr)
//   DELETE — idempotent (ikinci dəfə 404, amma server vəziyyəti eynidir)
import type { DB } from '../../db.js';
import type { Config } from '../../config.js';
import { conflict, notFound } from '../../errors.js';
import { isoNow } from '../../lib/crypto.js';
import { orderBy, offsetOf, pageOf } from '../../lib/listing.js';
import { customersRepo, type CustomerRow } from './repo.js';

export interface CustomerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  active?: boolean;
}

export const toCustomer = (c: CustomerRow) => ({
  id: c.id,
  firstName: c.first_name,
  lastName: c.last_name,
  email: c.email,
  phone: c.phone,
  city: c.city,
  active: c.active === 1,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

// v2: breaking change — firstName + lastName → fullName
export const toCustomerV2 = (c: CustomerRow) => {
  const { firstName, lastName, ...rest } = toCustomer(c);
  return { id: rest.id, fullName: `${firstName} ${lastName}`, email: rest.email, phone: rest.phone, city: rest.city, active: rest.active, createdAt: rest.createdAt, updatedAt: rest.updatedAt };
};

const SORT = { id: 'id', lastName: 'last_name', city: 'city', createdAt: 'created_at' };

export class CustomersService {
  constructor(
    private db: DB,
    private config: Config,
  ) {}

  list(q: { city?: string; active?: boolean; q?: string; page: number; size: number; sort?: string }) {
    const filter = { city: q.city, active: q.active, q: q.q };
    const total = customersRepo.count(this.db, filter);
    const rows = customersRepo.list(this.db, filter, orderBy(q.sort ?? 'id', SORT), q.size, offsetOf(q.page, q.size));
    return pageOf(rows, q.page, q.size, total);
  }

  get(id: number): CustomerRow {
    const c = customersRepo.get(this.db, id);
    if (!c) throw notFound('CUSTOMER_NOT_FOUND', 'Müştəri tapılmadı');
    return c;
  }

  // Email unikallığını DB özü qoruyur (UNIQUE constraint) — biz yalnız xətanı 409-a çeviririk.
  private withUniqueEmail<T>(email: string, fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw conflict('EMAIL_EXISTS', 'Bu email artıq qeydiyyatdadır', [{ field: 'email', message: email }]);
      }
      throw err;
    }
  }

  create(input: CustomerInput): CustomerRow {
    const now = isoNow(this.config.now());
    const id = this.withUniqueEmail(input.email, () =>
      customersRepo.insert(this.db, {
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone ?? null,
        city: input.city ?? null,
        active: input.active === false ? 0 : 1,
        created_at: now,
        updated_at: now,
      }),
    );
    return this.get(id);
  }

  // PUT: bütün sahələr sorğudan gəlir (sxemdə hamısı required) — köhnə dəyərlər istifadə OLUNMUR.
  replace(id: number, input: Required<CustomerInput>): CustomerRow {
    this.get(id);
    this.withUniqueEmail(input.email, () =>
      customersRepo.update(this.db, {
        id,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        city: input.city,
        active: input.active ? 1 : 0,
        updated_at: isoNow(this.config.now()),
      }),
    );
    return this.get(id);
  }

  // PATCH: mövcud sətir + yalnız göndərilən sahələr.
  patch(id: number, input: Partial<CustomerInput>): CustomerRow {
    const c = this.get(id);
    const email = input.email ?? c.email;
    this.withUniqueEmail(email, () =>
      customersRepo.update(this.db, {
        id,
        first_name: input.firstName ?? c.first_name,
        last_name: input.lastName ?? c.last_name,
        email,
        phone: input.phone ?? c.phone,
        city: input.city ?? c.city,
        active: input.active === undefined ? c.active : input.active ? 1 : 0,
        updated_at: isoNow(this.config.now()),
      }),
    );
    return this.get(id);
  }

  delete(id: number): void {
    if (customersRepo.delete(this.db, id) === 0) throw notFound('CUSTOMER_NOT_FOUND', 'Müştəri tapılmadı');
  }
}

