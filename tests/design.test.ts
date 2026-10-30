// Design (Google Stitch): asinxron generasiya → redaktə, HTML sanitize, günlük limitlər (tələbə + ortaq hovuz), kredit refund,
// timeout → polling, sessiya izolyasiyası, admin istifadə paneli. Real Stitch-ə sorğu getmir (fakeStitch).
import { describe, expect, it } from 'vitest';
import { config as baseConfig } from '../server/src/config.js';
import { bakuTime, estimateComplexity, nextResetUtc } from '../server/src/modules/design/service.js';
import { sanitizeDesignHtml } from '../server/src/modules/design/sanitize.js';
import { StitchClient, StitchError } from '../server/src/modules/design/stitch.js';
import { createTestApp, expectMatchesSpec, fakeStitch } from './helpers.js';

type T = ReturnType<typeof createTestApp>;
const idle = (t: T) => (t.app.locals.design as { idle(): Promise<void> }).idle();

async function setup(t: T, username = 'student') {
  const h = { Authorization: `Bearer ${(await t.login(username)).access_token}` };
  const session = await t.api().post('/api/v1/design/sessions').set(h).send({ title: 'Bank' });
  expect(session.status, JSON.stringify(session.body)).toBe(201);
  const send = (prompt: string) => t.api().post(`/api/v1/design/sessions/${session.body.id}/messages`).set(h).send({ prompt });
  return { h, sessionId: session.body.id as string, send };
}

describe('Design: generasiya axını', () => {
  it('ilk mesaj → GENERATE (202 + Location), polling → SUCCEEDED, HTML sanitize; ikinci mesaj → EDIT həmin ekranı redaktə edir', async () => {
    const stitch = fakeStitch();
    const t = createTestApp({ stitchTransport: stitch });
    const { h, sessionId, send } = await setup(t);
    const first = await send('Bank login ekranı');
    expect(first.status).toBe(202);
    expectMatchesSpec(first, 'designPostMessage');
    expect(first.headers.location).toBe(`/api/v1/design/jobs/${first.body.id}`);
    expect(first.body).toMatchObject({ kind: 'GENERATE', status: 'QUEUED', credits: 3, complexity: 'SIMPLE' });
    await idle(t);

    const job = await t.api().get(`/api/v1/design/jobs/${first.body.id}`).set(h);
    expect(job.body).toMatchObject({ status: 'SUCCEEDED', hasHtml: true, screenId: 'scr2' });
    expect(job.body.message).toContain('Qaranlıq rejim');
    const htmlRes = await t.api().get(`/api/v1/design/jobs/${first.body.id}/html`).set(h);
    const html = htmlRes.body.html as string;
    // imzalı preview URL: token-siz açılır, öz CSP-si (sandbox) var; imza dəyişdirilsə → 403
    const preview = await t.api().get(htmlRes.body.previewUrl);
    expect(preview.status).toBe(200);
    expect(preview.headers['content-security-policy']).toMatch(/sandbox allow-scripts/);
    expect(preview.headers['content-security-policy']).toContain('https://cdn.tailwindcss.com');
    expect(preview.text).toBe(html);
    expect((await t.api().get(htmlRes.body.previewUrl.replace(/sig=[a-f0-9]/, 'sig=0'))).status).toBeGreaterThanOrEqual(403);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('cdn.tailwindcss.com');
    expect(html).not.toMatch(/alert\(|onclick|stitch\.withgoogle/);

    const second = await send('Düyməni yaşıl et');
    expect(second.body.kind).toBe('EDIT');
    expect(second.body.credits).toBe(2);
    await idle(t);
    const edit = stitch.calls.find((c) => c.tool === 'edit_screens')!;
    expect(edit.args.selectedScreenIds).toEqual(['scr2']);
    const session = await t.api().get(`/api/v1/design/sessions/${sessionId}`).set(h);
    expect(session.body.messages.map((m: { status: string }) => m.status)).toEqual(['SUCCEEDED', 'SUCCEEDED']);
    expect(session.body.currentScreenId).toBe('scr3');
  });

  it('generasiya gedərkən ikinci mesaj → 409; başqa tələbə sessiyanı və işi görmür (404)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = createTestApp({ stitchTransport: fakeStitch({ generate_screen_from_text: async () => (await gate, { outputComponents: [{ design: { screens: [{ id: 's1', htmlCode: { name: 'projects/p/files/f' } }] } }] }) }) });
    const { sessionId, send } = await setup(t);
    const job = await send('Ekran 1');
    expect((await send('Ekran 2')).body.code).toBe('DESIGN_JOB_IN_PROGRESS');
    const rauf = { Authorization: `Bearer ${(await t.login('rauf')).access_token}` };
    expect((await t.api().get(`/api/v1/design/sessions/${sessionId}`).set(rauf)).status).toBe(404);
    expect((await t.api().get(`/api/v1/design/jobs/${job.body.id}`).set(rauf)).status).toBe(404);
    release();
    await idle(t);
  });

  it('Stitch xətaları: auth / kvota → FAILED + kredit refund (limit geri qayıdır); timeout → polling ilə nəticə tapılır', async () => {
    const auth = createTestApp({ stitchTransport: fakeStitch({ generate_screen_from_text: () => { throw new StitchError('AUTH', 'HTTP 403'); } }) });
    const a = await setup(auth);
    const job = await a.send('Login');
    await idle(auth);
    const failed = await auth.api().get(`/api/v1/design/jobs/${job.body.id}`).set(a.h);
    expect(failed.body).toMatchObject({ status: 'FAILED', credits: 0, error: { code: 'DESIGN_AUTH_FAILED' } });
    expect((await auth.api().get('/api/v1/design/usage').set(a.h)).body.user.used).toBe(0);

    // timeout: Stitch generasiyanı davam etdirir — TƏKRAR göndərilmir, list_screens ilə yeni ekran gözlənilir
    let listed = 0;
    const stitch = fakeStitch({
      generate_screen_from_text: () => { throw new StitchError('TIMEOUT', 'timed out'); },
      list_screens: () => ({ screens: ++listed > 2 ? [{ id: 'late' }] : [] }),
    });
    const t = createTestApp({ stitchTransport: stitch });
    const s = await setup(t);
    const late = await s.send('Uzun ekran');
    await idle(t);
    expect((await t.api().get(`/api/v1/design/jobs/${late.body.id}`).set(s.h)).body).toMatchObject({ status: 'SUCCEEDED', screenId: 'late' });
    expect(stitch.calls.filter((c) => c.tool === 'generate_screen_from_text')).toHaveLength(1);
  });

  it('STITCH_API_KEY yoxdur → 503 DESIGN_NOT_CONFIGURED; usage configured:false', async () => {
    const t = createTestApp({ stitchTransport: null });
    const h = { Authorization: `Bearer ${(await t.login()).access_token}` };
    const res = await t.api().post('/api/v1/design/sessions').set(h).send({});
    expect([res.status, res.body.code]).toEqual([503, 'DESIGN_NOT_CONFIGURED']);
    expect((await t.api().get('/api/v1/design/usage').set(h)).body.configured).toBe(false);
  });
});

describe('Design: kredit idarəetməsi', () => {
  it('tələbənin günlük limiti → 429 DESIGN_DAILY_LIMIT + Retry-After, mesajda Bakı vaxtı; başqa tələbə davam edir', async () => {
    const t = createTestApp({ config: { design: { ...baseConfig.design, apiKey: 'x', perUserDaily: 2 } } });
    const { send } = await setup(t);
    for (const p of ['A', 'B']) {
      expect((await send(p)).status).toBe(202);
      await idle(t);
    }
    const limited = await send('C');
    expect([limited.status, limited.body.code]).toEqual([429, 'DESIGN_DAILY_LIMIT']);
    expect(limited.body.message).toContain('04:00');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    const rauf = await setup(t, 'rauf');
    expect((await rauf.send('D')).status).toBe(202);
    await idle(t);
  });

  it('ortaq hovuz: həddi keçəcək sorğu → 429 DESIGN_POOL_EXHAUSTED; 80%-də warning; admin paneli göstərir', async () => {
    const t = createTestApp({ config: { design: { ...baseConfig.design, apiKey: 'x', poolHardLimit: 10 } } });
    const a = await setup(t);
    const b = await setup(t, 'rauf');
    for (const s of [a, b, a]) {
      expect((await s.send('Ekran')).status).toBe(202); // 3 + 3 + 2 (edit) = 8 kredit
      await idle(t);
    }
    const usage = await t.api().get('/api/v1/design/usage').set(a.h);
    expectMatchesSpec(usage, 'designUsage');
    expect(usage.body.pool).toMatchObject({ usedCredits: 8, percent: 80, warning: true, exhausted: false });
    const blocked = await b.send('Bir neçə ekran: dashboard, profil, ayarlar'); // edit COMPLEX = 4 → 12 > 10
    expect([blocked.status, blocked.body.code]).toEqual([429, 'DESIGN_POOL_EXHAUSTED']);

    const admin = await t.api().get('/api/v1/admin/design-usage').set('Authorization', `Bearer ${(await t.login('muellim1')).access_token}`);
    expect(admin.status).toBe(200);
    expectMatchesSpec(admin, 'adminDesignUsage');
    expect(admin.body).toMatchObject({ warning: true, usedCredits: 8 });
    expect(admin.body.topUsers[0]).toMatchObject({ username: 'student', credits: 5 });
    expect((await t.api().get('/api/v1/admin/design-usage').set(a.h)).status).toBe(403);
  });

  it('sayğac UTC gününə bağlıdır: ertəsi gün (UTC 00:00) limit yenidən açılır', async () => {
    const t = createTestApp({ config: { design: { ...baseConfig.design, apiKey: 'x', perUserDaily: 1 } } });
    const { sessionId, send } = await setup(t);
    await send('A');
    await idle(t);
    expect((await send('B')).status).toBe(429);
    t.clock.now = nextResetUtc(t.clock.now);
    const h = { Authorization: `Bearer ${(await t.login()).access_token}` }; // köhnə token-in vaxtı keçib
    expect((await t.api().post(`/api/v1/design/sessions/${sessionId}/messages`).set(h).send({ prompt: 'B' })).status).toBe(202);
    await idle(t);
  });
});

describe('Design: köməkçilər', () => {
  it('Bakı vaxtı, növbəti sıfırlanma, mürəkkəblik', () => {
    const now = new Date('2026-10-30T21:30:00Z');
    expect(nextResetUtc(now).toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(bakuTime(nextResetUtc(now))).toBe('31.10.2026 04:00');
    expect(estimateComplexity('Login ekranı')).toBe('SIMPLE');
    expect(estimateComplexity('3 ekran: login, dashboard, profil')).toBe('COMPLEX');
    expect(estimateComplexity('x'.repeat(401))).toBe('COMPLEX');
  });

  it('sanitize: yalnız Tailwind skriptləri; on*, javascript:, iframe, meta refresh, yad link/skript silinir', () => {
    const out = sanitizeDesignHtml(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=https://evil">
      <script src="https://cdn.tailwindcss.com?plugins=forms"></script><script id="tailwind-config">tailwind.config = { theme: {} }</script>
      <script src="https://evil.com/x.js"></script><script>tailwind.config = {}; fetch('https://evil')</script>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><link rel="stylesheet" href="https://evil.com/a.css">
      </head><body><img src="https://lh3.googleusercontent.com/a.png" onerror="x()"><a href="javascript:alert(1)">a</a>
      <iframe src="https://evil"></iframe><form action="https://evil"><button onclick="x()">B</button></form></body></html>`);
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.match(/<script/g)).toHaveLength(2);
    expect(out).toContain('fonts.googleapis.com');
    expect(out).not.toMatch(/evil|onerror|onclick|javascript:|<iframe|refresh/);
    expect(out).toContain('lh3.googleusercontent.com');
  });

  it('StitchClient: Stitch ekran əvəzinə yalnız mətn qaytarsa → INVALID (aydın mesaj)', async () => {
    const client = new StitchClient(fakeStitch({ generate_screen_from_text: () => ({ outputComponents: [{ text: 'Hansı rəngləri istəyirsiniz?' }] }) }), { ...baseConfig.design, pollIntervalMs: 0 }, async () => {});
    await expect(client.generate('p1', 'x', 'MOBILE')).rejects.toMatchObject({ kind: 'INVALID' });
  });
});
