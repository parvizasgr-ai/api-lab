// Qeydiyyat: ad, soyad, qrup, username, parol → yeni USER + onun sandbox bank datası + avtomatik login.
//   * Format qaydaları OpenAPI-dədir (RegisterRequest, 422); burada — sxemin ifadə edə bilmədiyi qaydalar:
//     ehtiyatda saxlanan username-lər, zəif/yayılmış parollar, parolun username/adla eyni olması, təkrar username (409)
//   * Hər yeni tələbəyə öz hesabları və kartları verilir — Bank, köçürmə, kartı blokla dərsləri ilk gündən işləyir.
//     Başlanğıc balans CREDIT əməliyyatı ilə yazılır (balans = əməliyyatların cəmi — db/queries/02 uzlaşması pozulmur).
import type { DB } from '../../db.js';
import type { Config } from '../../config.js';
import { ApiError, conflict } from '../../errors.js';
import { hashPassword, isoNow } from '../../lib/crypto.js';

export interface RegisterInput {
  firstName: string;
  lastName: string;
  groupName: string;
  username: string;
  password: string;
}

// Seed tələbəsi ilə eyni scope-lar (admin heç vaxt)
export const STUDENT_SCOPES = ['accounts:read', 'cards:read', 'cards:write', 'transfers:write', 'bookings:read', 'bookings:write', 'books:write', 'music:read', 'music:write'];

export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'superadmin', 'superuser', 'system', 'support', 'apilab', 'api', 'postgres',
  'null', 'undefined', 'me', 'test', 'guest', 'moderator', 'teacher', 'muellim',
]);

// Ən çox yayılmış parollar (qısa siyahı — tədris mühiti üçün kifayətdir)
export const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344', 'password',
  'password1', 'passw0rd', 'qwertyui', 'qwerty12', 'qwerty123', 'qwertyuiop', 'asdfghjk', 'iloveyou', 'abcd1234',
  'abc12345', 'azerbaijan', 'azerbaycan', 'baku1234', 'parol123', 'salam123', 'admin123', 'student123', 'letmein1',
]);

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ');

export function passwordProblems(password: string, input: Pick<RegisterInput, 'username' | 'firstName' | 'lastName'>): string[] {
  const lower = password.toLowerCase();
  const problems: string[] = [];
  if (COMMON_PASSWORDS.has(lower)) problems.push('Bu parol çox yayılmışdır — başqa parol seçin');
  if (lower === input.username.toLowerCase()) problems.push('Parol username ilə eyni ola bilməz');
  for (const name of [input.firstName, input.lastName]) {
    if (name.trim().length >= 3 && lower.includes(name.trim().toLowerCase())) problems.push('Parolda adınız və ya soyadınız olmamalıdır');
  }
  if (/^(.)\1+$/.test(password)) problems.push('Parol eyni simvolun təkrarı ola bilməz');
  return [...new Set(problems)];
}

const pad = (n: number, width = 4) => String(n).padStart(width, '0');
const monthEnd = (now: Date, years: number) => new Date(Date.UTC(now.getUTCFullYear() + years, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

export async function registerUser(db: DB, config: Config, raw: RegisterInput) {
  const input = { ...raw, firstName: collapse(raw.firstName), lastName: collapse(raw.lastName), groupName: collapse(raw.groupName) };
  const details: { field: string; message: string }[] = [];
  if (RESERVED_USERNAMES.has(input.username)) details.push({ field: '/username', message: 'Bu username ehtiyatda saxlanılır' });
  for (const message of passwordProblems(input.password, input)) details.push({ field: '/password', message });
  if (details.length) throw new ApiError(422, details.some((d) => d.field === '/password') ? 'WEAK_PASSWORD' : 'VALIDATION_ERROR', 'Qeydiyyat məlumatları qəbul olunmadı', details);

  const now = config.now();
  const at = isoNow(now);
  // .immediate — hesab nömrəsi (max + 1) ardıcıl ayrılsın; paralel qeydiyyatlar toqquşmasın
  return db.transaction(async () => {
    if (await db.prepare(`SELECT 1 FROM users WHERE username = ?`).get(input.username)) {
      throw conflict('USERNAME_TAKEN', 'Bu username artıq istifadə olunur', [{ field: '/username', message: input.username }]);
    }
    const userId = (await db
      .prepare(
        `INSERT INTO users (username, password_hash, full_name, first_name, last_name, group_name, email, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'USER', ?, ?) RETURNING id`,
      )
      .pluck()
      .get(input.username, hashPassword(input.password), `${input.firstName} ${input.lastName}`, input.firstName, input.lastName, input.groupName, at, at)) as number;
    for (const scope of STUDENT_SCOPES) await db.prepare(`INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)`).run(userId, scope);

    const sandbox = await createSandbox(db, userId, now);
    await db
      .prepare(`INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?, 'REGISTER', 'users', ?, ?, ?)`)
      .run(userId, String(userId), JSON.stringify({ groupName: input.groupName, accounts: sandbox }), at);
    return userId;
  }).immediate();
}

// Sandbox bank datası: AZN cari hesab (1 000.00) + USD yığım hesabı (500.00), hər birinə kart.
// Çağıran tranzaksiyanı .immediate() ilə açmalıdır — hesab nömrəsi (max + 1) ardıcıl ayrılsın, paralel çağırışlar toqquşmasın.
// Qeydiyyatda və müəllim (superadmin) hesabı üçün istifadə olunur. Yaradılan hesab nömrələrini qaytarır.
export async function createSandbox(db: DB, userId: number, now: Date): Promise<string[]> {
  const at = isoNow(now);
  const last = ((await db.prepare(`SELECT COALESCE(MAX(substr(id, 9)::int), 0) FROM accounts WHERE id ~ '^AZ21NABZ[0-9]{4}$'`).pluck().get()) as number) ?? 0;
  if (last + 2 > 9999) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Sandbox hesab nömrələri bitib — müəllimə müraciət edin');
  const sandbox = [
    { id: `AZ21NABZ${pad(last + 1)}`, currency: 'AZN', type: 'CURRENT', amount: 100_000, brand: 'VISA', limit: 200_000, years: 3 },
    { id: `AZ21NABZ${pad(last + 2)}`, currency: 'USD', type: 'SAVINGS', amount: 50_000, brand: 'MASTERCARD', limit: 100_000, years: 2 },
  ];
  for (const a of sandbox) {
    await db.prepare(`INSERT INTO accounts (id, owner_id, currency, balance_minor, type, opened_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)`).run(a.id, userId, a.currency, a.type, at, at);
    await db.prepare(`INSERT INTO transactions (account_id, type, amount_minor, currency, description, created_at) VALUES (?, 'CREDIT', ?, ?, 'Başlanğıc balans (sandbox)', ?)`).run(a.id, a.amount, a.currency, at);
    await db.prepare(`UPDATE accounts SET balance_minor = balance_minor + ?, updated_at = ? WHERE id = ?`).run(a.amount, at, a.id);
    const last4 = pad(Math.floor(Math.random() * 10_000));
    await db
      .prepare(`INSERT INTO cards (owner_id, account_id, last4, brand, status, daily_limit_minor, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`)
      .run(userId, a.id, last4, a.brand, a.limit, monthEnd(now, a.years), at, at);
  }
  return sandbox.map((a) => a.id);
}
