// Mock Google OAuth2 — Authorization Code flow.
import { describe, it, expect } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

const CLIENT = { client_id: 'apilab-portal', client_secret: 'apilab-portal-secret' };
const REDIRECT = 'http://localhost:5173/oauth/callback';

function setup() {
  const t = createTestApp();

  async function authorize(form: Record<string, string> = {}, headers: Record<string, string> = {}) {
    return t
      .api()
      .post('/oauth/authorize')
      .set(headers)
      .type('form')
      .send({ client_id: CLIENT.client_id, redirect_uri: REDIRECT, scope: 'openid profile email cards:read', state: 'state-12345678', username: 'student', password: 'student123', decision: 'allow', ...form });
  }

  async function getCode(form: Record<string, string> = {}) {
    const res = await authorize(form);
    expect(res.status).toBe(302);
    return new URL(res.headers.location).searchParams.get('code')!;
  }

  function token(form: Record<string, string>) {
    return t.api().post('/oauth/token').type('form').send(form);
  }

  return { ...t, authorize, getCode, token };
}

describe('GET /oauth/authorize', () => {
  const t = setup();

  it('200 HTML consent səhifəsi (hesab seçimi)', async () => {
    const res = await t
      .api()
      .get('/oauth/authorize')
      .query({ response_type: 'code', client_id: 'apilab-portal', redirect_uri: REDIRECT, scope: 'openid email', state: 'abcdefgh1' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Aysel Məmmədova');
    expect(res.text).toContain('name="state" value="abcdefgh1"');
  });

  it('qeydiyyatsız redirect_uri → 400 (redirect edilmir)', async () => {
    const res = await t
      .api()
      .get('/oauth/authorize')
      .query({ response_type: 'code', client_id: 'apilab-portal', redirect_uri: 'https://evil.example/cb', state: 'abcdefgh1' });
    expect(res.status).toBe(400);
    expectMatchesSpec(res, 'oauthAuthorizePage');
    expect(res.body.code).toBe('INVALID_REDIRECT_URI');
  });

  it('state yoxdur → 422', async () => {
    const res = await t.api().get('/oauth/authorize').query({ response_type: 'code', client_id: 'apilab-portal', redirect_uri: REDIRECT });
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('query state');
  });
});

describe('POST /oauth/authorize (consent)', () => {
  const t = setup();

  it('allow → 302 redirect_uri?code=...&state=... (state geri qaytarılır)', async () => {
    const res = await t.authorize();
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get('state')).toBe('state-12345678');
    const code = url.searchParams.get('code')!;
    const row = t.db.prepare(`SELECT * FROM oauth_codes WHERE code = ?`).get(code) as { expires_at: string; created_at: string; used_at: null };
    expect(new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()).toBe(60_000);
    expect(row.used_at).toBeNull();
  });

  it('deny → 302 error=access_denied', async () => {
    const res = await t.authorize({ decision: 'deny', password: '' });
    const url = new URL(res.headers.location);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('code')).toBeNull();
  });

  it('səhv parol → 401, consent səhifəsi xəta ilə', async () => {
    const res = await t.authorize({ password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Parol səhvdir');
  });
});

describe('POST /oauth/token', () => {
  it('code → access token → /oauth/userinfo', async () => {
    const t = setup();
    const code = await t.getCode();
    const res = await t.token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, ...CLIENT });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'oauthToken');
    expect(res.body.scope).toBe('openid profile email cards:read');
    expect(res.headers['cache-control']).toBe('no-store');

    const info = await t.api().get('/oauth/userinfo').set(bearer(res.body.access_token));
    expect(info.status).toBe(200);
    expectMatchesSpec(info, 'oauthUserinfo');
    expect(info.body).toMatchObject({ sub: '1', preferred_username: 'student', email: 'student@apilab.az' });
  });

  it('client autentifikasiyası Basic header ilə də işləyir', async () => {
    const t = setup();
    const code = await t.getCode();
    const res = await t
      .api()
      .post('/oauth/token')
      .auth(CLIENT.client_id, CLIENT.client_secret)
      .type('form')
      .send({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
    expect(res.status).toBe(200);
  });

  it('code REUSE → 400 invalid_grant (code birdəfəlikdir)', async () => {
    const t = setup();
    const code = await t.getCode();
    const form = { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, ...CLIENT };
    expect((await t.token(form)).status).toBe(200);
    const again = await t.token(form);
    expect(again.status).toBe(400);
    expectMatchesSpec(again, 'oauthToken');
    expect(again.body).toEqual({ error: 'invalid_grant', error_description: 'Authorization code artıq istifadə olunub' });
  });

  it('60 saniyədən sonra → invalid_grant (vaxtı keçib)', async () => {
    const t = setup();
    const code = await t.getCode();
    t.clock.advance(61);
    const res = await t.token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, ...CLIENT });
    expect(res.status).toBe(400);
    expect(res.body.error_description).toContain('vaxtı keçib');
  });

  it('redirect_uri fərqlidir → invalid_grant', async () => {
    const t = setup();
    const code = await t.getCode();
    const res = await t.token({ grant_type: 'authorization_code', code, redirect_uri: 'http://localhost:3000/oauth/callback', ...CLIENT });
    expect(res.body.error).toBe('invalid_grant');
  });

  it('səhv client_secret → 401 invalid_client', async () => {
    const t = setup();
    const code = await t.getCode();
    const res = await t.token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'apilab-portal', client_secret: 'x' });
    expect(res.status).toBe(401);
    expectMatchesSpec(res, 'oauthToken');
    expect(res.body.error).toBe('invalid_client');
  });

  it('validation xətası RFC formatındadır: unsupported_grant_type, invalid_request', async () => {
    const t = setup();
    const grant = await t.token({ grant_type: 'password', code: 'x', redirect_uri: REDIRECT, ...CLIENT });
    expect(grant.status).toBe(400);
    expect(grant.body.error).toBe('unsupported_grant_type');
    const missing = await t.token({ grant_type: 'authorization_code', redirect_uri: REDIRECT, ...CLIENT });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('invalid_request');
    expect(missing.body).not.toHaveProperty('traceId');
  });

  it('OAuth token-ə admin scope-u verilmir (admin hesabı ilə belə)', async () => {
    const t = setup();
    const code = await t.getCode({ username: 'admin', password: 'admin123', scope: 'openid admin accounts:read' });
    const res = await t.token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, ...CLIENT });
    expect(res.body.scope).toBe('openid accounts:read');
  });
});

describe('SPA rejimi (Accept: application/json)', () => {
  it('GET authorize → hesablar JSON; POST authorize → 200 {location}; səhv parol → 401 JSON', async () => {
    const t = setup();
    const info = await t
      .api()
      .get('/oauth/authorize')
      .set('Accept', 'application/json')
      .query({ response_type: 'code', client_id: 'apilab-portal', redirect_uri: REDIRECT, state: 'spa-state-1' });
    expect(info.status).toBe(200);
    expectMatchesSpec(info, 'oauthAuthorizePage');
    expect(info.body.accounts.map((a: { username: string }) => a.username)).toEqual(['student', 'admin', 'rauf']);
    expect(info.body).not.toHaveProperty('accounts.0.password_hash');

    const ok = await t.authorize({}, { Accept: 'application/json' });
    expect(ok.status).toBe(200);
    expectMatchesSpec(ok, 'oauthAuthorizeDecision');
    const url = new URL(ok.body.location);
    expect(url.searchParams.get('state')).toBe('state-12345678');
    expect(url.searchParams.get('code')).toMatch(/^ac_/);

    const wrong = await t.authorize({ password: 'nope' }, { Accept: 'application/json' });
    expect(wrong.status).toBe(401);
    expectMatchesSpec(wrong, 'oauthAuthorizeDecision');
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('OAuth refresh token', () => {
  it('token cavabında refresh_token var; refresh scope-u GENİŞLƏNDİRMİR (scope escalation yoxdur)', async () => {
    const t = setup();
    const code = await t.getCode({ scope: 'openid accounts:read' });
    const res = await t.token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, ...CLIENT });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'oauthToken');
    expect(res.body.refresh_token).toMatch(/^rt_/);

    const refreshed = await t.api().post('/api/v1/auth/refresh').send({ refresh_token: res.body.refresh_token });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.scope).toBe('openid accounts:read');
    expect(refreshed.body.scope).not.toContain('cards:write');
    // Parol ilə login isə istifadəçinin bütün scope-larını verir
    expect((await t.login()).scope).toContain('cards:write');
  });
});
