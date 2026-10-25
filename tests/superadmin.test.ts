// Superadmin (müəllim) paneli: istifadəçilər, qruplar, detal, CSV; giriş hüquqları; _reset qorunması.
import { describe, expect, it } from 'vitest';
import { createTestApp, bearer, expectMatchesSpec } from './helpers.js';

const register = (t: ReturnType<typeof createTestApp>, username: string, groupName: string, firstName = 'Tələbə') =>
  t.api().post('/api/v1/auth/register').send({ firstName, lastName: 'Yeniyev', groupName, username, password: 'Gizli-Parol-77' });

async function setup() {
  const t = createTestApp();
  const a = (await register(t, 'nermin.q', 'BA-2026-A', 'Nərmin')).body.access_token as string;
  const b = (await register(t, 'tural.m', 'BA-2026-A', 'Tural')).body.access_token as string;
  await register(t, 'leyla.k', 'IT-2026-B', 'Leyla');
  // Nərmin 2 tapşırıq edir, SQL sorğusu göndərir
  const taskIds = (await t.db.prepare(`SELECT id FROM tasks ORDER BY lesson, sort_order, id LIMIT 2`).pluck().all()) as number[];
  for (const id of taskIds) await t.api().put(`/api/v1/tasks/${id}/progress`).set(bearer(a)).send({ done: true });
  await t.api().post('/api/v1/_db/query').set(bearer(a)).send({ sql: 'SELECT id FROM cards' });
  await t.api().get('/api/v1/accounts').set(bearer(b));
  const teacher = (await t.login('muellim1')).access_token;
  return { t, teacher, a, b, taskIds };
}

describe('superadmin paneli', () => {
  it('GET /admin/users: hamı, nəticə və aktivlik; qrup filteri, axtarış, sort, səhifələmə', async () => {
    const { t, teacher } = await setup();
    const all = await t.api().get('/api/v1/admin/users?size=100').set(bearer(teacher));
    expect(all.status).toBe(200);
    expectMatchesSpec(all, 'adminListUsers');
    const nermin = all.body.items.find((u: { username: string }) => u.username === 'nermin.q');
    expect(nermin).toMatchObject({ groupName: 'BA-2026-A', role: 'USER', progress: { done: 2, total: 16, percent: 13 } });
    expect(nermin.activity.sqlQueries).toBe(1);
    expect(nermin.activity.requests).toBeGreaterThanOrEqual(3);
    expect(nermin.lastLoginAt).not.toBeNull();

    const group = await t.api().get('/api/v1/admin/users').query({ group: 'BA-2026-A', sort: '-progress' }).set(bearer(teacher));
    expect(group.body.items.map((u: { username: string }) => u.username)).toEqual(['nermin.q', 'tural.m']);
    const search = await t.api().get('/api/v1/admin/users').query({ q: 'LEYLA' }).set(bearer(teacher));
    expect(search.body.items.map((u: { username: string }) => u.username)).toEqual(['leyla.k']);
    const paged = await t.api().get('/api/v1/admin/users').query({ role: 'USER', size: 2, page: 2, sort: 'name' }).set(bearer(teacher));
    expect(paged.body).toMatchObject({ page: 2, size: 2, total: 5 }); // student, rauf + 3 yeni
    const like = await t.api().get('/api/v1/admin/users').query({ q: '%' }).set(bearer(teacher));
    expect(like.body.items).toEqual([]); // LIKE xüsusi simvolları escape olunur
  });

  it('GET /admin/groups: qrup xülasəsi (yalnız tələbələr)', async () => {
    const { t, teacher } = await setup();
    const res = await t.api().get('/api/v1/admin/groups').set(bearer(teacher));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'adminListGroups');
    const ba = res.body.items.find((g: { groupName: string }) => g.groupName === 'BA-2026-A');
    expect(ba).toMatchObject({ students: 2, avgPercent: 6, completedAll: 0 });
    expect(ba.activeLast7Days).toBe(2);
    expect(res.body.items.map((g: { groupName: string | null }) => g.groupName)).toEqual(['BA-2026-A', 'Demo', 'IT-2026-B']);
  });

  it('GET /admin/users/{id}: dərslər, tapşırıqlar, son sorğular, SQL sorğuları; olmayan 404', async () => {
    const { t, teacher, taskIds } = await setup();
    const id = (await t.db.prepare(`SELECT id FROM users WHERE username = 'nermin.q'`).pluck().get()) as number;
    const res = await t.api().get(`/api/v1/admin/users/${id}`).set(bearer(teacher));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'adminGetUser');
    expect(res.body.lessons[0]).toMatchObject({ lesson: 1, done: 2, total: 4, percent: 50 });
    expect(res.body.tasks.filter((x: { done: boolean }) => x.done).map((x: { id: number }) => x.id)).toEqual(taskIds);
    expect(res.body.sqlQueries[0]).toMatchObject({ sql: 'SELECT id FROM cards', result: 'OK', rowCount: expect.any(Number) });
    expect(res.body.recentRequests.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt/);
    const missing = await t.api().get('/api/v1/admin/users/99999').set(bearer(teacher));
    expect(missing.status).toBe(404);
    expectMatchesSpec(missing, 'adminGetUser');
  });

  it('GET /admin/results.csv: UTF-8 BOM, başlıq, qrup filteri, CSV injection qorunması', async () => {
    const { t, teacher } = await setup();
    await t.db.prepare(`UPDATE users SET first_name = '=HYPERLINK("http://evil")' WHERE username = 'leyla.k'`).run();
    const res = await t.api().get('/api/v1/admin/results.csv').set(bearer(teacher)).buffer(true).parse((r, cb) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => (data += c));
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="?api-lab-netice-\d{4}-\d{2}-\d{2}\.csv"?/);
    const text = res.body as string;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('username,ad,soyad,qrup,qeydiyyat,son_giris,ders1_(4),ders2_(5),ders3_(7),tamamlanib,cemi,faiz,api_sorgulari,sql_sorgulari');
    expect(lines.find((l) => l.startsWith('nermin.q,'))).toMatch(/^nermin\.q,Nərmin,Yeniyev,BA-2026-A,.*,2,0,0,2,16,13,\d+,1$/);
    expect(lines.find((l) => l.startsWith('leyla.k,'))).toContain(`"'=HYPERLINK(""http://evil"")"`);
    const only = await t.api().get('/api/v1/admin/results.csv').query({ group: 'IT-2026-B' }).set(bearer(teacher));
    expect(only.text.trim().split('\r\n')).toHaveLength(2);
  });

  it('giriş: tələbə və ADMIN → 403, tokensiz → 401', async () => {
    const { t, a } = await setup();
    const admin = (await t.login('admin')).access_token;
    for (const url of ['/api/v1/admin/users', '/api/v1/admin/groups', '/api/v1/admin/users/1', '/api/v1/admin/results.csv']) {
      expect((await t.api().get(url).set(bearer(a))).status, url).toBe(403);
      expect((await t.api().get(url).set(bearer(admin))).status, url).toBe(403);
      expect((await t.api().get(url)).status, url).toBe(401);
    }
  });

  it('superadmin token: rol SUPERADMIN, scope-da admin + superadmin; admin imkanları da var (material yükləmə siyahısı)', async () => {
    const { t, teacher } = await setup();
    const me = await t.api().get('/api/v1/auth/me').set(bearer(teacher));
    expect(me.body.role).toBe('SUPERADMIN');
    expect(me.body.scopes).toEqual(expect.arrayContaining(['admin', 'superadmin']));
    expect((await t.api().get('/api/v1/_history?all=true').set(bearer(teacher))).status).toBe(200);
  });
});

describe('_reset qorunması', () => {
  it('qeydiyyatlı tələbə yoxdursa ADMIN sıfırlaya bilir (demo)', async () => {
    const t = createTestApp();
    const admin = (await t.login('admin')).access_token;
    expect((await t.api().post('/api/v1/_reset').set(bearer(admin))).status).toBe(200);
  });

  it('qeydiyyatlı tələbələr varsa: ADMIN → 403, superadmin təsdiqsiz → 409, ?confirm=all-users → 200; superadmin qalır', async () => {
    const { t, teacher } = await setup();
    const admin = (await t.login('admin')).access_token;
    expect((await t.api().post('/api/v1/_reset').set(bearer(admin))).status).toBe(403);
    const unconfirmed = await t.api().post('/api/v1/_reset').set(bearer(teacher));
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.code).toBe('RESET_WOULD_DELETE_USERS');
    expect(unconfirmed.body.message).toContain('3 qeydiyyatlı');
    expectMatchesSpec(unconfirmed, 'adminReset');
    expect(await t.db.prepare(`SELECT COUNT(*) FROM users`).pluck().get()).toBe(7);
    const ok = await t.api().post('/api/v1/_reset?confirm=all-users').set(bearer(teacher));
    expect(ok.status).toBe(200);
    expect(await t.db.prepare(`SELECT username FROM users ORDER BY id`).pluck().all()).toEqual(['student', 'admin', 'rauf', 'muellim1']);
    expect((await t.api().post('/api/v1/auth/login').send({ username: 'muellim1', password: 'Muellim-Parol-1' })).status).toBe(200);
  });
});
