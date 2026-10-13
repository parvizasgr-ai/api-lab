// Müştərilər: CRUD, PUT vs PATCH, ETag/304, XML/406/415, HEAD/OPTIONS, v2, AUTH_CUSTOMERS.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

const NEW = { firstName: 'Rəna', lastName: 'Quliyeva', email: 'rena.quliyeva@example.az', phone: '+994501112233', city: 'Gəncə' };

describe('customers v1', () => {
  let t: ReturnType<typeof createTestApp>;
  beforeEach(() => {
    t = createTestApp();
  });

  it('GET /customers — pagination, filter, axtarış, sort + Deprecation başlıqları', async () => {
    const res = await t.api().get('/api/v1/customers');
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'listCustomers');
    expect(res.body).toMatchObject({ page: 1, size: 20, total: 25, totalPages: 2 });
    expect(res.headers.deprecation).toMatch(/^@\d+$/);
    expect(res.headers.sunset).toContain('2026');
    expect(res.headers.link).toBe('</api/v2/customers>; rel="successor-version"');

    const baku = await t.api().get('/api/v1/customers').query({ city: 'Bakı', active: false });
    expect(baku.body.items.map((c: { id: number }) => c.id)).toEqual([21]);

    const q = await t.api().get('/api/v1/customers').query({ q: 'quliyev' });
    expect(q.body.items.map((c: { email: string }) => c.email)).toEqual(['tural.quliyev@example.az']);

    const sorted = await t.api().get('/api/v1/customers').query({ sort: '-lastName', size: 1 });
    // SQLite BINARY collation Unicode kod nöqtəsinə görə sıralayır: 'Ə' (U+018F) 'Z'-dən sonra gəlir.
    expect(sorted.body.items[0].lastName).toBe('Əsgərov');
  });

  it('POST — 201 + Location + ETag; təkrar email 409; səhv data 422; səhv Content-Type 415', async () => {
    const res = await t.api().post('/api/v1/customers').send(NEW);
    expect(res.status).toBe(201);
    expectMatchesSpec(res, 'createCustomer');
    expect(res.headers.location).toBe('/api/v1/customers/26');
    expect(res.headers.etag).toMatch(/^"[a-f0-9]{16}"$/);
    expect(res.body.active).toBe(true); // default
    expect((await t.api().get(res.headers.location)).body.email).toBe(NEW.email);

    const dup = await t.api().post('/api/v1/customers').send({ ...NEW, email: 'nigar.aliyeva@example.az' });
    expect(dup.status).toBe(409);
    expectMatchesSpec(dup, 'createCustomer');
    expect(dup.body.code).toBe('EMAIL_EXISTS');

    const invalid = await t.api().post('/api/v1/customers').send({ ...NEW, email: 'rena-at-example', age: 25 });
    expect(invalid.status).toBe(422);
    expect(invalid.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['/age', '/email']);

    const xmlBody = await t.api().post('/api/v1/customers').set('Content-Type', 'application/xml').send('<customer/>');
    expect(xmlBody.status).toBe(415);
  });

  it('PUT vs PATCH: PUT bütün sahələri tələb edir və hamısını əvəz edir, PATCH yalnız göndərilənləri dəyişir', async () => {
    const partialPut = await t.api().put('/api/v1/customers/1').send({ city: 'Sumqayıt' });
    expect(partialPut.status).toBe(422);
    expect(partialPut.body.details.length).toBeGreaterThanOrEqual(5); // firstName, lastName, email, phone, active

    const patch = await t.api().patch('/api/v1/customers/1').send({ city: 'Sumqayıt' });
    expect(patch.status).toBe(200);
    expectMatchesSpec(patch, 'patchCustomer');
    expect(patch.body).toMatchObject({ firstName: 'Nigar', lastName: 'Əliyeva', phone: '+994501234501', city: 'Sumqayıt' });

    const full = { firstName: 'Nigar', lastName: 'Həsənova', email: 'nigar.h@example.az', phone: '+994551234567', city: 'Bakı', active: false };
    const put1 = await t.api().put('/api/v1/customers/1').send(full);
    expect(put1.status).toBe(200);
    expectMatchesSpec(put1, 'replaceCustomer');
    expect(put1.body).toMatchObject(full);
    // PUT idempotentdir: eyni sorğu → eyni vəziyyət
    const put2 = await t.api().put('/api/v1/customers/1').send(full);
    expect({ ...put2.body, updatedAt: null }).toEqual({ ...put1.body, updatedAt: null });

    expect((await t.api().patch('/api/v1/customers/1').send({})).status).toBe(422);
    const emailTaken = await t.api().patch('/api/v1/customers/1').send({ email: 'tural.quliyev@example.az' });
    expect(emailTaken.status).toBe(409);
    expect((await t.api().patch('/api/v1/customers/999').send({ city: 'Quba' })).status).toBe(404);
  });

  it('ETag + If-None-Match → 304; data dəyişəndən sonra köhnə ETag → 200', async () => {
    const first = await t.api().get('/api/v1/customers/1');
    expect(first.status).toBe(200);
    expectMatchesSpec(first, 'getCustomer');
    const etag = first.headers.etag;

    const cached = await t.api().get('/api/v1/customers/1').set('If-None-Match', etag);
    expect(cached.status).toBe(304);
    expect(cached.text).toBe('');
    expect(cached.headers.etag).toBe(etag);

    await t.api().patch('/api/v1/customers/1').send({ city: 'Quba' });
    const changed = await t.api().get('/api/v1/customers/1').set('If-None-Match', etag);
    expect(changed.status).toBe(200);
    expect(changed.headers.etag).not.toBe(etag);
  });

  it('Accept: application/xml → XML; dəstəklənməyən Accept → 406', async () => {
    const xml = await t.api().get('/api/v1/customers/1').set('Accept', 'application/xml');
    expect(xml.status).toBe(200);
    expect(xml.headers['content-type']).toContain('application/xml');
    expect(xml.text).toContain('<customer><id>1</id><firstName>Nigar</firstName>');
    expect(xml.headers.etag).not.toBe((await t.api().get('/api/v1/customers/1')).headers.etag);

    const list = await t.api().get('/api/v1/customers?size=2').set('Accept', 'application/xml');
    expect(list.text).toMatch(/^<\?xml[^>]+>\n<customerPage><items><customer>.*<\/customer><customer>/);

    const csv = await t.api().get('/api/v1/customers/1').set('Accept', 'text/csv');
    expect(csv.status).toBe(406);
    expectMatchesSpec(csv, 'getCustomer');
  });

  it('DELETE → 204, ikinci dəfə 404; HEAD və OPTIONS', async () => {
    const head = await t.api().head('/api/v1/customers/2');
    expect(head.status).toBe(200);
    expect(head.headers.etag).toBeDefined();
    expect(head.text ?? '').toBe('');

    const del = await t.api().delete('/api/v1/customers/2');
    expect(del.status).toBe(204);
    const again = await t.api().delete('/api/v1/customers/2');
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('CUSTOMER_NOT_FOUND');
    expect((await t.api().head('/api/v1/customers/2')).status).toBe(404);
    expect(t.db.prepare(`SELECT COUNT(*) FROM customers WHERE id = 2`).pluck().get()).toBe(0);

    const options = await t.api().options('/api/v1/customers');
    expect(options.status).toBe(204);
    expect(options.headers.allow).toBe('GET, HEAD, POST, OPTIONS');
  });
});

describe('customers v2 + AUTH_CUSTOMERS', () => {
  it('v2: fullName (firstName/lastName yoxdur), Deprecation yoxdur', async () => {
    const t = createTestApp();
    const res = await t.api().get('/api/v2/customers/1');
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'getCustomerV2');
    expect(res.body.fullName).toBe('Nigar Əliyeva');
    expect(res.body).not.toHaveProperty('firstName');
    expect(res.headers.deprecation).toBeUndefined();
    const list = await t.api().get('/api/v2/customers?city=Gəncə');
    expectMatchesSpec(list, 'listCustomersV2');
    expect(list.body.total).toBe(3);
    expect((await t.api().get('/api/v2/customers/999')).status).toBe(404);
  });

  it('AUTH_CUSTOMERS=true → Bearer tələb olunur (spec də yenilənir)', async () => {
    const t = createTestApp({ config: { authCustomers: true } });
    expect((await t.api().get('/api/v1/customers')).status).toBe(401);
    const { access_token } = await t.login();
    expect((await t.api().get('/api/v1/customers').set(bearer(access_token))).status).toBe(200);
    expect((await t.api().options('/api/v1/customers')).status).toBe(204);
    const doc = await t.api().get('/api/openapi.json');
    expect(doc.body.paths['/api/v1/customers'].get.security).toEqual([{ bearerAuth: [] }]);
  });
});
