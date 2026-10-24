// Sinif (LAN) rejimi: təhlükəsiz başlanğıc qaydası, ADMIN_PASSWORD, PUBLIC_URL OAuth callback-ləri, classroom:check.
import { describe, expect, it } from 'vitest';
import { classroomChecks, suggestedLanEnv, type ClassroomInput } from '../server/src/lib/classroom.js';
import { DEFAULT_JWT_SECRET, exposureProblems, isLoopbackHost } from '../server/src/lib/exposure.js';
import { config as baseConfig } from '../server/src/config.js';
import { createTestApp, bearer } from './helpers.js';

const STRONG = 'x'.repeat(48);

describe('şəbəkəyə açıq başlanğıc qaydası', () => {
  it('default HOST yalnız bu kompüterdir (localhost — 127.0.0.1 və ::1)', () => {
    expect(baseConfig.host).toBe('localhost');
    expect(exposureProblems({ host: baseConfig.host, jwtSecret: DEFAULT_JWT_SECRET, adminPassword: '' })).toEqual([]);
    expect(isLoopbackHost('127.0.0.1') && isLoopbackHost('::1') && isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
  });

  it('loopback-da default sirlər qəbul olunur', () => {
    expect(exposureProblems({ host: '127.0.0.1', jwtSecret: DEFAULT_JWT_SECRET, adminPassword: '' })).toEqual([]);
  });

  it('HOST=0.0.0.0: default/qısa JWT_SECRET və olmayan/demo ADMIN_PASSWORD başlanğıcı dayandırır', () => {
    expect(exposureProblems({ host: '0.0.0.0', jwtSecret: DEFAULT_JWT_SECRET, adminPassword: '' })).toHaveLength(2);
    expect(exposureProblems({ host: '0.0.0.0', jwtSecret: 'short', adminPassword: 'admin123' }).join(' ')).toMatch(/32 simvol.*demo parol/);
    expect(exposureProblems({ host: '192.168.1.10', jwtSecret: STRONG, adminPassword: 'Sinif-2026-Gizli!' })).toEqual([]);
  });
});

describe('ADMIN_PASSWORD', () => {
  it('tətbiq olunur və /_reset-dən sonra admin123-ə qayıtmır', async () => {
    const { api, db, config } = createTestApp({ config: { adminPassword: 'Sinif-2026-Gizli!' } });
    const { applyAdminPassword } = await import('../server/src/lib/exposure.js');
    await applyAdminPassword(db, config); // server başlanğıcı (index.ts) kimi
    expect((await api().post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).status).toBe(401);
    const login = await api().post('/api/v1/auth/login').send({ username: 'admin', password: 'Sinif-2026-Gizli!' });
    expect(login.status).toBe(200);
    expect((await api().post('/api/v1/_reset').set(bearer(login.body.access_token))).status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).status).toBe(401);
    expect((await api().post('/api/v1/auth/login').send({ username: 'admin', password: 'Sinif-2026-Gizli!' })).status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ username: 'student', password: 'student123' })).status).toBe(200);
  });

  it('verilməyibsə seed parolu qalır (yerli rejim)', async () => {
    const { api } = createTestApp();
    expect((await api().post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).status).toBe(200);
  });
});

describe('OAuth: PUBLIC_URL callback-ləri (portal LAN IP-dən açılanda)', () => {
  const authorize = (redirectUri: string) => ({ response_type: 'code', client_id: 'apilab-portal', redirect_uri: redirectUri, state: 'st-12345678' });

  it('PUBLIC_URL-in /oauth/callback və /docs/oauth2-redirect.html ünvanları qəbul olunur, başqa IP yox', async () => {
    const { api } = createTestApp({ config: { publicUrl: 'http://192.168.1.10:3000' } });
    for (const uri of ['http://192.168.1.10:3000/oauth/callback', 'http://192.168.1.10:3000/docs/oauth2-redirect.html', 'http://localhost:5173/oauth/callback']) {
      expect((await api().get('/oauth/authorize').set('Accept', 'application/json').query(authorize(uri))).status, uri).toBe(200);
    }
    for (const uri of ['http://192.168.1.99:3000/oauth/callback', 'http://192.168.1.10:3000/evil', 'https://evil.example/oauth/callback']) {
      const res = await api().get('/oauth/authorize').set('Accept', 'application/json').query(authorize(uri));
      expect(res.status, uri).toBe(400);
      expect(res.body.code).toBe('INVALID_REDIRECT_URI');
    }
  });

  it('LAN origin-indən gələn brauzer sorğusu CORS-dan keçir', async () => {
    const { api } = createTestApp({ config: { publicUrl: 'http://192.168.1.10:3000' } });
    const res = await api().get('/api/v1/airports').set('Origin', 'http://192.168.1.10:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://192.168.1.10:3000');
  });
});

describe('classroom:check', () => {
  const base: ClassroomInput = {
    config: {
      host: '127.0.0.1', port: 3000, publicUrl: 'http://localhost:3000', jwtSecret: DEFAULT_JWT_SECRET, adminPassword: '',
      trustedProxies: ['loopback'], corsOrigins: [], rateLimit: { limit: 60, windowSec: 60 }, external: { serverKeyEnabled: false, serverKey: '' },
    },
    lan: false,
    lanIps: ['192.168.1.10'],
    portalBuilt: true,
    tools: { pdftoppm: true, soffice: true },
  };
  const levels = (input: ClassroomInput) => Object.fromEntries(classroomChecks(input).map((c) => [c.item, c.level]));

  it('yerli rejim: default sirlər yalnız xəbərdarlıqdır, fail yoxdur', () => {
    const l = levels(base);
    expect(Object.values(l)).not.toContain('fail');
    expect(l.JWT_SECRET).toBe('warn');
  });

  it('--lan: HOST, JWT_SECRET, ADMIN_PASSWORD, PUBLIC_URL=localhost → fail; TRUSTED_PROXIES → warn', () => {
    const l = levels({ ...base, lan: true });
    expect([l.HOST, l.JWT_SECRET, l.ADMIN_PASSWORD, l.PUBLIC_URL]).toEqual(['fail', 'fail', 'fail', 'fail']);
    expect(l.TRUSTED_PROXIES).toBe('warn');
  });

  it('düzgün LAN konfiqurasiyası: fail yoxdur', () => {
    const l = levels({
      ...base,
      config: { ...base.config, host: '0.0.0.0', publicUrl: 'http://192.168.1.10:3000', jwtSecret: STRONG, adminPassword: 'Sinif-2026-Gizli!', trustedProxies: false },
    });
    expect(Object.values(l)).not.toContain('fail');
    expect(Object.values(l)).not.toContain('warn');
  });

  it('portal build yoxdursa və server key açıq, amma açarsızdırsa → fail', () => {
    const l = levels({ ...base, portalBuilt: false, config: { ...base.config, external: { serverKeyEnabled: true, serverKey: '' } } });
    expect(l['Portal build']).toBe('fail');
    expect(l['External server key']).toBe('fail');
  });

  it('təklif olunan .env bloku: LAN IP, təsadüfi sirlər, TRUSTED_PROXIES=none; nəticə exposureProblems-dən keçir', () => {
    const env = suggestedLanEnv('192.168.1.10', 3000);
    expect(env).toContain('HOST=0.0.0.0');
    expect(env).toContain('PUBLIC_URL=http://192.168.1.10:3000');
    expect(env).toContain('TRUSTED_PROXIES=none');
    const jwt = /JWT_SECRET=(.+)/.exec(env)![1];
    const admin = /ADMIN_PASSWORD=(.+)/.exec(env)![1];
    expect(jwt).not.toBe(DEFAULT_JWT_SECRET);
    expect(exposureProblems({ host: '0.0.0.0', jwtSecret: jwt, adminPassword: admin })).toEqual([]);
    expect(suggestedLanEnv('192.168.1.10', 3000)).not.toBe(env); // hər dəfə yeni sirlər
  });
});
