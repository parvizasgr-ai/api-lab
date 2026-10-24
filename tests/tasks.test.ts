// Tapşırıqlar: siyahı, irəliləyiş (istifadəçiyə görə ayrılır), ADMIN CRUD, markdown import, seed SQL yoxlamaları.
import { describe, it, expect } from 'vitest';
import { guardQuery } from '../server/src/modules/sql/guard.js';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

async function setup() {
  const t = createTestApp();
  return { ...t, admin: (await t.login('admin')).access_token, student: (await t.login('student')).access_token, rauf: (await t.login('rauf')).access_token };
}

describe('seed tapşırıqları', () => {
  it('3 dərs üzrə 16 tapşırıq; hər SQL yoxlaması SELECT-dir və xətasız işləyir', async () => {
    const t = await setup();
    const res = await t.api().get('/api/v1/tasks').set(bearer(t.student));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'listTasks');
    expect(res.body.items).toHaveLength(16);
    const byLesson = (n: number) => res.body.items.filter((x: { lesson: number }) => x.lesson === n).length;
    expect([byLesson(1), byLesson(2), byLesson(3)]).toEqual([4, 5, 7]);
    for (const task of res.body.items as { title: string; sqlCheck: string }[]) {
      const { executedSql } = guardQuery(task.sqlCheck, 200);
      expect(() => t.db.prepare(executedSql).all(), task.title).not.toThrow();
    }
    expect((await t.api().get('/api/v1/tasks?lesson=2').set(bearer(t.student))).body.items).toHaveLength(5);
    expect((await t.api().get('/api/v1/tasks')).status).toBe(401);
  });
});

describe('irəliləyiş', () => {
  it('hər istifadəçi öz irəliləyişini görür; PUT idempotentdir (doneAt dəyişmir); done=false geri alır', async () => {
    const t = await setup();
    const mark = (token: string, id: number, done: boolean) => t.api().put(`/api/v1/tasks/${id}/progress`).set(bearer(token)).send({ done });

    const first = await mark(t.student, 1, true);
    expect(first.status).toBe(200);
    expectMatchesSpec(first, 'setTaskProgress');
    expect(first.body).toMatchObject({ taskId: 1, done: true });
    await mark(t.student, 5, true);
    t.clock.advance(120);
    const again = await mark(t.student, 1, true);
    expect(again.body.doneAt).toBe(first.body.doneAt);

    const studentList = (await t.api().get('/api/v1/tasks').set(bearer(t.student))).body.items;
    const raufList = (await t.api().get('/api/v1/tasks').set(bearer(t.rauf))).body.items;
    expect(studentList.filter((x: { done: boolean }) => x.done).map((x: { id: number }) => x.id)).toEqual([1, 5]);
    expect(raufList.some((x: { done: boolean }) => x.done)).toBe(false);

    const me = await t.api().get('/api/v1/tasks/progress/me').set(bearer(t.student));
    expect(me.status).toBe(200);
    expectMatchesSpec(me, 'myTaskProgress');
    expect(me.body).toMatchObject({ total: 16, done: 2, byLesson: [{ lesson: 1, total: 4, done: 1 }, { lesson: 2, total: 5, done: 1 }, { lesson: 3, total: 7, done: 0 }] });
    expect((await t.api().get('/api/v1/tasks/progress/me').set(bearer(t.rauf))).body.done).toBe(0);

    const undo = await mark(t.student, 1, false);
    expect(undo.body).toEqual({ taskId: 1, done: false, doneAt: null });
    expect(await t.db.prepare(`SELECT task_id FROM task_progress WHERE user_id = 1`).pluck().all()).toEqual([5]);

    expect((await mark(t.student, 999, true)).status).toBe(404);
    expect((await t.api().put('/api/v1/tasks/1/progress').set(bearer(t.student)).send({ done: 'yes' })).status).toBe(422);
  });
});

describe('ADMIN CRUD', () => {
  it('yarat 201 + Location, eyni başlıq 409, SQL yoxlaması SELECT olmalıdır, tələbə 403; PATCH; DELETE irəliləyişi də silir', async () => {
    const t = await setup();
    const body = { lesson: 2, title: 'OPTIONS ilə metodları öyrən', method: 'OPTIONS', path: '/api/v1/customers', expectedStatus: 204, sqlCheck: "SELECT method, status FROM request_log WHERE method = 'OPTIONS'" };
    const created = await t.api().post('/api/v1/tasks').set(bearer(t.admin)).send(body);
    expect(created.status).toBe(201);
    expectMatchesSpec(created, 'createTask');
    expect(created.headers.location).toBe(`/api/v1/tasks/${created.body.id}`);

    const dup = await t.api().post('/api/v1/tasks').set(bearer(t.admin)).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('TASK_EXISTS');
    const badSql = await t.api().post('/api/v1/tasks').set(bearer(t.admin)).send({ ...body, title: 'x', sqlCheck: 'DELETE FROM customers' });
    expect(badSql.status).toBe(422);
    expect(badSql.body.code).toBe('SQL_NOT_ALLOWED');
    expect((await t.api().post('/api/v1/tasks').set(bearer(t.admin)).send({ ...body, title: 'y', path: 'api/v1' })).status).toBe(422);
    expect((await t.api().post('/api/v1/tasks').set(bearer(t.student)).send({ ...body, title: 'z' })).status).toBe(403);

    const patched = await t.api().patch(`/api/v1/tasks/${created.body.id}`).set(bearer(t.admin)).send({ sortOrder: 9, sqlCheck: null });
    expect(patched.status).toBe(200);
    expectMatchesSpec(patched, 'updateTask');
    expect(patched.body).toMatchObject({ sortOrder: 9, sqlCheck: null, title: body.title });

    await t.api().put(`/api/v1/tasks/${created.body.id}/progress`).set(bearer(t.student)).send({ done: true });
    expect((await t.api().delete(`/api/v1/tasks/${created.body.id}`).set(bearer(t.admin))).status).toBe(204);
    expect(await t.db.prepare(`SELECT COUNT(*) FROM task_progress WHERE task_id = ?`).pluck().get(created.body.id)).toBe(0);
    expect((await t.api().delete(`/api/v1/tasks/${created.body.id}`).set(bearer(t.admin))).status).toBe(404);
  });
});

describe('markdown import', () => {
  const md = (text: string) => Buffer.from(text.replace(/^ {4}/gm, ''));
  const VALID = md(`# Dərs 1
    ## Valyuta məzənnələrini al
    - method: GET
    - path: /api/v1/currencies/rates?base=USD
    - status: 200
    Yenilənmiş təsvir: indi **USD** base ilə.
    \`\`\`sql
    SELECT quote, rate FROM exchange_rates LIMIT 5
    \`\`\`

    # Dərs 2
    ## OPTIONS sorğusu
    - method: OPTIONS
    - path: /api/v1/customers
    - status: 204
    - order: 10
    \`Allow\` başlığına baxın.
    \`\`\`bash
    curl -X OPTIONS http://localhost:3000/api/v1/customers -i
    \`\`\`
    `);

  it('yeni tapşırıq yaradılır, mövcud (dərs + başlıq) yenilənir; kod bloku təsvirdə qalır', async () => {
    const t = await setup();
    const res = await t.api().post('/api/v1/tasks/import').set(bearer(t.admin)).attach('file', VALID, { filename: 'tasks.md', contentType: 'text/markdown' });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'importTasks');
    expect(res.body).toMatchObject({ created: 1, updated: 1 });
    const [updated, created] = res.body.tasks;
    expect(updated).toMatchObject({ id: 1, path: '/api/v1/currencies/rates?base=USD', sqlCheck: 'SELECT quote, rate FROM exchange_rates LIMIT 5' });
    expect(updated.descriptionMd).toContain('**USD**');
    expect(created).toMatchObject({ lesson: 2, method: 'OPTIONS', expectedStatus: 204, sortOrder: 10, sqlCheck: null });
    expect(created.descriptionMd).toContain('```bash');
    expect(await t.db.prepare(`SELECT COUNT(*) FROM tasks`).pluck().get()).toBe(17);
  });

  it('səhv fayl → 422 INVALID_TASK_FILE (sətir nömrələri ilə), heç nə yazılmır; .md olmayan fayl 415; tələbə 403', async () => {
    const t = await setup();
    const bad = md(`## Dərs başlığı olmayan tapşırıq
    - method: GET
    - path: /api/v1/health
    - status: 200
    # Dərs 2
    ## Səhv status
    - method: FETCH
    - path: api/v1/customers
    - status: 999
    \`\`\`sql
    DROP TABLE customers
    \`\`\`
    `);
    const res = await t.api().post('/api/v1/tasks/import').set(bearer(t.admin)).attach('file', bad, { filename: 'bad.md', contentType: 'text/markdown' });
    expect(res.status).toBe(422);
    expectMatchesSpec(res, 'importTasks');
    expect(res.body.code).toBe('INVALID_TASK_FILE');
    const messages = res.body.details.map((d: { field: string; message: string }) => `${d.field}: ${d.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^line 1: .*dərs təyin olunmayıb/),
        expect.stringMatching(/^line 6: .*method/),
        expect.stringMatching(/^line 6: .*path/),
        expect.stringMatching(/^line 6: .*status/),
        expect.stringMatching(/^line 6: .*SELECT/),
      ]),
    );
    expect(await t.db.prepare(`SELECT COUNT(*) FROM tasks`).pluck().get()).toBe(16);

    const pdf = await t.api().post('/api/v1/tasks/import').set(bearer(t.admin)).attach('file', Buffer.from('%PDF-1.4'), { filename: 'tasks.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(415);
    expect((await t.api().post('/api/v1/tasks/import').set(bearer(t.student)).attach('file', VALID, 'tasks.md')).status).toBe(403);
  });
});
