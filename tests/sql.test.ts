// SQL Playground: yalnız SELECT, tokenizer əsaslı bloklama, LIMIT, timeout, gizli sütunlar, rate limit, audit.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';
import { guardQuery } from '../server/src/modules/sql/guard.js';

describe('_db/schema', () => {
  it('cədvəllər + view-lar, sütun tipləri, PK/FK, index-lər; hash sütunları "hidden"', async () => {
    const t = createTestApp();
    const res = await t.api().get('/api/v1/_db/schema');
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'dbSchema');
    const byName = Object.fromEntries(res.body.tables.map((x: { name: string }) => [x.name, x]));
    expect(byName.v_card_overview).toMatchObject({ type: 'view', rowCount: null });
    expect(byName.cards.foreignKeys).toEqual(expect.arrayContaining([{ column: 'account_id', refTable: 'accounts', refColumn: 'id' }]));
    expect(byName.cards.indexes).toEqual(expect.arrayContaining([{ name: 'idx_cards_owner', columns: ['owner_id'], unique: false }]));
    expect(byName.users.columns.find((c: { name: string }) => c.name === 'password_hash')).toMatchObject({ hidden: true, type: 'TEXT', notNull: true });
    expect(byName.users.columns.find((c: { name: string }) => c.name === 'id')).toMatchObject({ primaryKey: true, hidden: false });
    expect(byName.api_keys.columns.find((c: { name: string }) => c.name === 'key_hash').hidden).toBe(true);
  });
});

describe('_db/query', () => {
  const t = createTestApp();
  beforeEach(() => t.clock.advance(60)); // hər test yeni rate limit pəncərəsində (20/dəq)
  const query = (sql: string) => t.api().post('/api/v1/_db/query').send({ sql });

  it('SELECT keçir: nəticə {columns, rows, rowCount, truncated, durationMs}', async () => {
    const res = await query("SELECT id, status FROM cards WHERE status = 'BLOCKED'");
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'dbQuery');
    expect(res.body).toMatchObject({ columns: ['id', 'status'], rows: [{ id: 3, status: 'BLOCKED' }], rowCount: 1, truncated: false, hiddenColumns: [] });
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('WITH ... SELECT, view-lar, string daxilində "DROP", replace() funksiyası keçir', async () => {
    expect((await query('WITH b AS (SELECT * FROM v_account_balances) SELECT username, SUM(balance) s FROM b GROUP BY username')).status).toBe(200);
    const s = await query("SELECT 'DROP TABLE cards; --' AS text, replace('a-b', '-', '+') AS r");
    expect(s.status).toBe(200);
    expect(s.body.rows[0]).toEqual({ text: 'DROP TABLE cards; --', r: 'a+b' });
  });

  it.each([
    ['DROP', 'DROP TABLE cards'],
    ['UPDATE', "UPDATE cards SET status = 'BLOCKED'"],
    ['çox statement', 'SELECT 1; DELETE FROM cards'],
    ['ATTACH', "ATTACH DATABASE '/tmp/x.db' AS x"],
    ['PRAGMA', 'PRAGMA writable_schema = ON'],
    ['VACUUM', 'VACUUM'],
    ['şərhlə gizlədilmiş yazı', '/* SELECT */ DELETE FROM cards'],
    ['sətir şərhindən sonra ikinci statement', 'SELECT 1 -- yalnız şərh\n; DROP TABLE cards'],
    ['WITH ... DELETE', 'WITH x AS (SELECT 1) DELETE FROM cards'],
    ['SELECT içində INSERT', 'SELECT * FROM cards WHERE id IN (SELECT 1) UNION SELECT * FROM cards; INSERT INTO cards DEFAULT VALUES'],
    ['load_extension', "SELECT load_extension('evil')"],
  ])('bloklanır: %s → 422 SQL_NOT_ALLOWED', async (_name, sql) => {
    const res = await query(sql);
    expect(res.status).toBe(422);
    expectMatchesSpec(res, 'dbQuery');
    expect(res.body.code).toBe('SQL_NOT_ALLOWED');
  });

  it('DB dəyişməyib (bütün cəhdlərdən sonra)', async () => {
    expect(await t.db.prepare(`SELECT COUNT(*) FROM cards`).pluck().get()).toBe(7);
    expect(await t.db.prepare(`SELECT status FROM cards WHERE id = 1`).pluck().get()).toBe('ACTIVE');
  });

  it('sintaksis xətası → 422 SQL_SYNTAX_ERROR', async () => {
    const res = await query('SELECT * FORM cards');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SQL_SYNTAX_ERROR');
    expect((await query('SELECT * FROM no_such_table')).body.code).toBe('SQL_SYNTAX_ERROR');
    expect((await query("SELECT 'bağlanmamış")).body.code).toBe('SQL_SYNTAX_ERROR');
  });

  it('LIMIT: yoxdursa 200 (truncated), böyükdürsə 200-ə endirilir, kiçikdirsə saxlanılır', async () => {
    const none = await query('SELECT id FROM flights');
    expect(none.body).toMatchObject({ rowCount: 200, truncated: true });
    expect(none.body.executedSql).toBe('SELECT id FROM flights LIMIT 201');
    const big = await query('SELECT id FROM flights ORDER BY id LIMIT 1000');
    expect(big.body).toMatchObject({ rowCount: 200, truncated: true, executedSql: 'SELECT id FROM flights ORDER BY id LIMIT 201' });
    const small = await query('SELECT id FROM flights LIMIT 5');
    expect(small.body).toMatchObject({ rowCount: 5, truncated: false });
    // Alt sorğudakı LIMIT ən üst səviyyə deyil — xaricə LIMIT əlavə olunur
    expect(guardQuery('SELECT * FROM (SELECT id FROM flights LIMIT 500)', 200).executedSql).toBe('SELECT * FROM (SELECT id FROM flights LIMIT 500) LIMIT 201');
    expect(guardQuery('SELECT id FROM flights LIMIT 10, 900', 200).executedSql).toBe('SELECT id FROM flights LIMIT 10, 201');
  });

  it('gizli sütunlar sızmır: SELECT *, birbaşa ad, CTE ilə ad dəyişmə, ifadə, string_agg', async () => {
    const star = await query('SELECT * FROM users');
    expect(star.status).toBe(200);
    expect(star.body.columns).not.toContain('password_hash');
    expect(star.body.columns).toEqual(expect.arrayContaining(['id', 'username', 'email']));
    expect(star.body.hiddenColumns).toEqual(['users.password_hash']);

    const direct = await query('SELECT username, password_hash FROM users');
    expect(direct.body.columns).toEqual(['username']);

    const attempts = [
      'WITH t(a, b, c) AS (SELECT id, username, password_hash FROM users) SELECT substr(c, 1, 100) AS x FROM t',
      'SELECT string_agg(password_hash, \',\') AS all_hashes FROM users',
      "SELECT key_hash || '' AS k FROM api_keys",
      'SELECT client_secret_hash AS s FROM oauth_clients',
      'SELECT u.*, length(u.password_hash) AS len FROM users u',
    ];
    for (const sql of attempts) {
      const res = await query(sql);
      expect(res.status, sql).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body, sql).not.toMatch(/scrypt\$|7e70e10d|770f45dc/);
    }
    // ifadələr yalnız əvəzedicini görür
    const expr = await query('SELECT substr(password_hash, 1, 8) AS x FROM users WHERE id = 1');
    expect(expr.body.rows[0].x).toBe('[hidden#');
    // əsl DB toxunulmayıb
    expect(await t.db.prepare(`SELECT password_hash FROM users WHERE id = 1`).pluck().get()).toMatch(/^scrypt\$/);
  });

  it('hər sorğu audit_log-a yazılır (uğurlu və rədd edilmiş), token varsa istifadəçi ilə', async () => {
    const before = (await t.db.prepare(`SELECT COUNT(*) FROM audit_log WHERE action = 'SQL_QUERY'`).pluck().get()) as number;
    const { access_token } = await t.login();
    await t.api().post('/api/v1/_db/query').set(bearer(access_token)).send({ sql: 'SELECT 1 AS one' });
    await query('DROP TABLE cards');
    const rows = (await t.db.prepare(`SELECT user_id, details FROM audit_log WHERE action = 'SQL_QUERY' ORDER BY id DESC LIMIT 2`).all()) as { user_id: number | null; details: string }[];
    expect(await t.db.prepare(`SELECT COUNT(*) FROM audit_log WHERE action = 'SQL_QUERY'`).pluck().get()).toBe(before + 2);
    expect(JSON.parse(rows[0].details)).toMatchObject({ sql: 'DROP TABLE cards', result: 'SQL_NOT_ALLOWED' });
    expect(rows[1].user_id).toBe(1);
    expect(JSON.parse(rows[1].details)).toMatchObject({ result: 'OK', rowCount: 1 });
  });
});

describe('_db/query — timeout və rate limit', () => {
  it('uzun CROSS JOIN → 422 SQL_TIMEOUT, server bloklanmır', async () => {
    const t = createTestApp({ config: { sqlPlayground: { timeoutMs: 300, maxRows: 200, maxBytes: 1_000_000 } } });
    const started = Date.now();
    const res = await t.api().post('/api/v1/_db/query').send({ sql: 'SELECT COUNT(*) FROM flights a, flights b, flights c' });
    expect(res.status).toBe(422);
    expectMatchesSpec(res, 'dbQuery');
    expect(res.body.code).toBe('SQL_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(2000);
    expect((await t.api().get('/api/v1/health')).status).toBe(200);
  });

  it('bu endpoint üçün 20 sorğu/dəqiqə: 21-ci → 429', async () => {
    const t = createTestApp();
    for (let i = 0; i < 20; i++) {
      const res = await t.api().post('/api/v1/_db/query').send({ sql: 'VACUUM' }); // icra olunmur, amma sayılır
      expect(res.status).toBe(422);
      expect(res.headers['x-ratelimit-limit']).toBe('20');
    }
    const blocked = await t.api().post('/api/v1/_db/query').send({ sql: 'SELECT 1' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect((await t.api().get('/api/v1/_db/schema')).status).toBe(200); // digər endpoint-lər ümumi limitdədir
  });
});
