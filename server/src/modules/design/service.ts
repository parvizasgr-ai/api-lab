// Design bölməsi (Google Stitch): sessiyalar, asinxron generasiya işləri və günlük kredit idarəetməsi.
//
// Axın: POST /design/sessions/{id}/messages → limit yoxlaması + iş (QUEUED) eyni .immediate() tranzaksiyasında → 202.
//       İş arxa planda: RUNNING → Stitch generate/edit (dəqiqələr) → HTML endirilir → sanitize → SUCCEEDED / FAILED.
//       Portal GET /design/jobs/{id} ilə status soruşur (polling).
//
// Kredit: Stitch-in günlük hovuzu (~400) BÜTÜN tələbələr üçün ortaqdır. Sayğac = design_jobs.credits cəmi (usage_day = UTC
// tarixi) — UTC 00:00-da (Bakı 04:00) yeni gün başlayır, sıfırlama avtomatikdir. Limitlər:
//   * tələbə başına gündə `perUserDaily` iş (generasiya + redaktə);
//   * hovuz `poolHardLimit`-ə (350) çatanda yeni sorğu qəbul olunmur; 80%-də logda və admin panelində xəbərdarlıq.
// Stitch-ə çatmayan xətalarda (açar, kvota, səhv sorğu) kredit 0-a endirilir — tələbənin limiti də geri qayıdır.
import crypto from 'node:crypto';
import type { DB } from '../../db.js';
import type { Config } from '../../config.js';
import { ApiError, conflict, notFound } from '../../errors.js';
import { isoNow } from '../../lib/crypto.js';
import { sanitizeDesignHtml } from './sanitize.js';
import { StitchClient, StitchError, httpTransport, type StitchTransport } from './stitch.js';

type DesignConfig = Config['design'];
export type DeviceType = 'MOBILE' | 'DESKTOP' | 'TABLET';

interface SessionRow {
  id: string;
  user_id: number;
  title: string;
  stitch_project_id: string | null;
  current_screen_id: string | null;
  device_type: DeviceType;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  session_id: string;
  user_id: number;
  kind: 'GENERATE' | 'EDIT';
  prompt: string;
  device_type: DeviceType;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  usage_day: string;
  credits: number;
  complexity: 'SIMPLE' | 'COMPLEX';
  screen_id: string | null;
  html: string | null;
  message: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const BAKU_OFFSET_MS = 4 * 3600_000; // Azərbaycan: UTC+4 (yay vaxtı yoxdur)

export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export function nextResetUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

// "31.10.2026 04:00" — Bakı vaxtı
export function bakuTime(d: Date): string {
  const b = new Date(d.getTime() + BAKU_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(b.getUTCDate())}.${p(b.getUTCMonth() + 1)}.${b.getUTCFullYear()} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}`;
}

// Təxmini mürəkkəblik: uzun təsvir və ya bir neçə ekran/səhifə → COMPLEX (daha çox kredit)
export function estimateComplexity(prompt: string): 'SIMPLE' | 'COMPLEX' {
  const multi = /(\b\d+|bir neçə|several|multiple|many|few)\s+(ekran|screen|səhifə|page|tab)/i.test(prompt) || /(ekranlar|screens|səhifələr|pages)\b/i.test(prompt);
  return prompt.length > 400 || multi ? 'COMPLEX' : 'SIMPLE';
}

const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

// Stitch xətası → tələbəyə aydın mesaj; refund — Stitch krediti xərcləməyibsə (sorğu rədd olunub)
function describe(err: unknown): { code: string; message: string; refund: boolean } {
  if (err instanceof StitchError) {
    switch (err.kind) {
      case 'AUTH':
        return { code: 'DESIGN_AUTH_FAILED', message: 'Stitch açarı etibarsızdır və ya icazəsi yoxdur — müəllimə bildirin', refund: true };
      case 'RATE_LIMIT':
        return { code: 'DESIGN_RATE_LIMITED', message: 'Stitch hazırda çox yüklüdür və ya günlük kvota bitib — bir az sonra yenidən cəhd edin', refund: true };
      case 'INVALID':
        return { code: 'DESIGN_INVALID_PROMPT', message: err.message.includes('ekran yaratmadı') ? err.message : 'Stitch sorğunu qəbul etmədi — təsviri dəyişib yenidən yazın', refund: true };
      case 'TIMEOUT':
        return { code: 'DESIGN_TIMEOUT', message: 'Generasiya gözləniləndən uzun çəkdi və nəticə gəlmədi — bir az sonra yenidən cəhd edin', refund: false };
      default:
        return { code: 'DESIGN_UPSTREAM_ERROR', message: 'Stitch xətası — bir az sonra yenidən cəhd edin', refund: false };
    }
  }
  return { code: 'DESIGN_UPSTREAM_ERROR', message: 'Gözlənilməz xəta — bir az sonra yenidən cəhd edin', refund: false };
}

export class DesignService {
  readonly stitch: StitchClient | null;
  private running = new Set<Promise<void>>();
  private warnedDay: string | null = null;

  constructor(
    private db: DB,
    private config: Config,
    transport: StitchTransport | null | undefined = undefined,
    wait?: (ms: number) => Promise<void>,
  ) {
    const t = transport === undefined ? (config.design.apiKey ? httpTransport(config.design.apiKey, config.design.endpoint) : null) : transport;
    this.stitch = t ? new StitchClient(t, config.design, wait) : null;
  }

  private get opts(): DesignConfig {
    return this.config.design;
  }

  private now() {
    return this.config.now();
  }

  get configured() {
    return this.stitch !== null;
  }

  // Testlər üçün: bütün arxa plan işləri bitsin
  async idle() {
    while (this.running.size) await Promise.all([...this.running]);
  }

  // Server yenidən başlayanda yarımçıq qalan işlər (yaddaşdakı icra itib)
  async failInterrupted(): Promise<number> {
    return (
      await this.db
        .prepare(
          `UPDATE design_jobs SET status = 'FAILED', error_code = 'DESIGN_INTERRUPTED', error_message = 'Server yenidən başladı — mesajı yenidən göndərin', finished_at = ?
           WHERE status IN ('QUEUED', 'RUNNING')`,
        )
        .run(isoNow(this.now()))
    ).changes;
  }

  // ---------------------------------------------------------------- kredit / limit
  async usage(userId: number) {
    const day = utcDay(this.now());
    const row = (await this.db
      .prepare(
        `SELECT COALESCE(SUM(credits), 0)::int AS pool,
                COUNT(*) FILTER (WHERE user_id = @userId AND credits > 0)::int AS mine,
                COUNT(*) FILTER (WHERE credits > 0)::int AS requests
         FROM design_jobs WHERE usage_day = @day`,
      )
      .get({ userId, day })) as { pool: number; mine: number; requests: number };
    const reset = nextResetUtc(this.now());
    const o = this.opts;
    return {
      day,
      resetsAt: isoNow(reset),
      resetsAtBaku: bakuTime(reset),
      user: { used: row.mine, limit: o.perUserDaily, remaining: Math.max(0, o.perUserDaily - row.mine) },
      pool: {
        usedCredits: row.pool,
        hardLimit: o.poolHardLimit,
        dailyCredits: o.poolDailyCredits,
        requests: row.requests,
        percent: Math.round((row.pool / o.poolHardLimit) * 100),
        warning: row.pool >= o.poolHardLimit * o.warnRatio,
        exhausted: row.pool >= o.poolHardLimit,
      },
      creditEstimates: o.credits,
    };
  }

  // Admin: bu günün və son 7 günün istifadəsi, ən aktiv tələbələr
  async adminUsage() {
    const day = utcDay(this.now());
    const today = await this.usage(0);
    const byDay = (await this.db
      .prepare(
        `SELECT usage_day AS day, SUM(credits)::int AS credits, COUNT(*) FILTER (WHERE credits > 0)::int AS requests,
                COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
         FROM design_jobs WHERE usage_day >= (?::date - 6)::text GROUP BY usage_day ORDER BY usage_day DESC`,
      )
      .all(day)) as { day: string; credits: number; requests: number; failed: number }[];
    const topUsers = (await this.db
      .prepare(
        `SELECT u.id AS "userId", u.username, u.full_name AS "fullName", SUM(j.credits)::int AS credits, COUNT(*)::int AS requests
         FROM design_jobs j JOIN users u ON u.id = j.user_id
         WHERE j.usage_day = ? AND j.credits > 0 GROUP BY u.id ORDER BY credits DESC, requests DESC LIMIT 10`,
      )
      .all(day)) as { userId: number; username: string; fullName: string; credits: number; requests: number }[];
    return { ...today.pool, day, resetsAt: today.resetsAt, resetsAtBaku: today.resetsAtBaku, perUserDaily: this.opts.perUserDaily, configured: this.configured, byDay, topUsers };
  }

  // ---------------------------------------------------------------- sessiyalar
  private toSession(s: SessionRow, jobs: JobRow[] = []) {
    return {
      id: s.id,
      title: s.title,
      deviceType: s.device_type,
      stitchProjectId: s.stitch_project_id,
      currentScreenId: s.current_screen_id,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      messages: jobs.map((j) => this.toJob(j)),
    };
  }

  toJob(j: JobRow) {
    return {
      id: j.id,
      sessionId: j.session_id,
      kind: j.kind,
      prompt: j.prompt,
      deviceType: j.device_type,
      status: j.status,
      credits: j.credits,
      complexity: j.complexity,
      screenId: j.screen_id,
      message: j.message,
      error: j.error_code ? { code: j.error_code, message: j.error_message ?? '' } : null,
      createdAt: j.created_at,
      startedAt: j.started_at,
      finishedAt: j.finished_at,
      hasHtml: j.html !== null,
    };
  }

  private async ownedSession(userId: number, sessionId: string): Promise<SessionRow> {
    const s = (await this.db.prepare(`SELECT * FROM design_sessions WHERE id = ?`).get(sessionId)) as SessionRow | undefined;
    // Başqasının sessiyası mövcudluğu açıqlanmadan 404 (tələbə id-ləri təxmin etməklə bir-birinin dizaynına baxa bilməsin)
    if (!s || s.user_id !== userId) throw notFound('DESIGN_SESSION_NOT_FOUND', 'Dizayn sessiyası tapılmadı');
    return s;
  }

  private requireStitch(): StitchClient {
    if (!this.stitch) throw new ApiError(503, 'DESIGN_NOT_CONFIGURED', 'Design bölməsi qoşulmayıb: serverin .env faylında STITCH_API_KEY yoxdur');
    return this.stitch;
  }

  async listSessions(userId: number) {
    const rows = (await this.db.prepare(`SELECT * FROM design_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`).all(userId)) as SessionRow[];
    return rows.map((s) => this.toSession(s));
  }

  // Hər sessiya = ayrıca Stitch project (tələbələrin dizaynları bir-birinə qarışmır)
  async createSession(userId: number, username: string, input: { title?: string; deviceType?: DeviceType }) {
    const stitch = this.requireStitch();
    const title = input.title?.trim() || 'Yeni dizayn';
    let projectId: string;
    try {
      projectId = await stitch.createProject(`callbox-${username}-${title}`.slice(0, 80));
    } catch (err) {
      const d = describe(err);
      throw new ApiError(d.code === 'DESIGN_RATE_LIMITED' ? 429 : d.code === 'DESIGN_AUTH_FAILED' ? 503 : 502, d.code, d.message);
    }
    const at = isoNow(this.now());
    const id = newId('ds');
    await this.db
      .prepare(`INSERT INTO design_sessions (id, user_id, title, stitch_project_id, device_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, title, projectId, input.deviceType ?? 'MOBILE', at, at);
    return this.toSession((await this.ownedSession(userId, id))!);
  }

  async getSession(userId: number, sessionId: string) {
    const s = await this.ownedSession(userId, sessionId);
    const jobs = (await this.db.prepare(`SELECT * FROM design_jobs WHERE session_id = ? ORDER BY created_at, id`).all(sessionId)) as JobRow[];
    return this.toSession(s, jobs);
  }

  async deleteSession(userId: number, sessionId: string) {
    await this.ownedSession(userId, sessionId);
    const active = await this.db.prepare(`SELECT 1 FROM design_jobs WHERE session_id = ? AND status IN ('QUEUED', 'RUNNING')`).get(sessionId);
    if (active) throw conflict('DESIGN_JOB_IN_PROGRESS', 'Generasiya gedir — bitəndən sonra silin');
    await this.db.prepare(`DELETE FROM design_sessions WHERE id = ?`).run(sessionId);
  }

  // ---------------------------------------------------------------- mesaj → iş (202)
  async postMessage(userId: number, sessionId: string, input: { prompt: string; deviceType?: DeviceType }) {
    this.requireStitch();
    const prompt = input.prompt.trim();
    if (!prompt) throw new ApiError(422, 'VALIDATION_ERROR', 'Boş mesaj göndərmək olmaz', [{ field: 'prompt', message: 'boş ola bilməz' }]);
    const o = this.opts;
    const job = await this.db
      .transaction(async () => {
        const s = await this.ownedSession(userId, sessionId);
        if (await this.db.prepare(`SELECT 1 FROM design_jobs WHERE session_id = ? AND status IN ('QUEUED', 'RUNNING')`).get(s.id)) {
          throw conflict('DESIGN_JOB_IN_PROGRESS', 'Əvvəlki generasiya hələ bitməyib — nəticəni gözləyin');
        }
        const usage = await this.usage(userId);
        const kind = s.current_screen_id ? 'EDIT' : 'GENERATE';
        const complexity = estimateComplexity(prompt);
        const credits = o.credits[complexity][kind];
        const retryAfter = String(Math.max(1, Math.ceil((Date.parse(usage.resetsAt) - this.now().getTime()) / 1000)));
        if (usage.user.remaining <= 0) {
          throw new ApiError(429, 'DESIGN_DAILY_LIMIT', `Bu gün üçün ${o.perUserDaily} generasiya limitiniz bitib. Limit ${usage.resetsAtBaku}-də (Bakı vaxtı) yenilənəcək`, [], { 'Retry-After': retryAfter });
        }
        if (usage.pool.usedCredits + credits > o.poolHardLimit) {
          throw new ApiError(429, 'DESIGN_POOL_EXHAUSTED', `Bütün tələbələr üçün ortaq günlük Stitch krediti bitib. Yenilənmə: ${usage.resetsAtBaku} (Bakı vaxtı)`, [], { 'Retry-After': retryAfter });
        }
        const at = isoNow(this.now());
        const id = newId('dj');
        const device = input.deviceType ?? s.device_type;
        await this.db
          .prepare(
            `INSERT INTO design_jobs (id, session_id, user_id, kind, prompt, device_type, status, usage_day, credits, complexity, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?)`,
          )
          .run(id, s.id, userId, kind, prompt, device, usage.day, credits, complexity, at);
        await this.db.prepare(`UPDATE design_sessions SET updated_at = ?, device_type = ? WHERE id = ?`).run(at, device, s.id);
        return (await this.db.prepare(`SELECT * FROM design_jobs WHERE id = ?`).get(id)) as JobRow;
      })
      .immediate();
    await this.checkPoolWarning();
    const run = this.execute(job.id).finally(() => this.running.delete(run));
    this.running.add(run);
    return this.toJob(job);
  }

  // Hovuzun 80%-i keçiləndə gündə bir dəfə log xəbərdarlığı (admin paneli də göstərir)
  private async checkPoolWarning() {
    const u = await this.usage(0);
    if (u.pool.warning && this.warnedDay !== u.day) {
      this.warnedDay = u.day;
      console.warn(`[design] ⚠ Stitch günlük hovuzunun ${u.pool.percent}%-i istifadə olunub (${u.pool.usedCredits}/${u.pool.hardLimit} kredit). Yenilənmə: ${u.resetsAtBaku} Bakı vaxtı`);
    }
  }

  async getJob(userId: number, jobId: string, withHtml = false) {
    const j = (await this.db.prepare(`SELECT * FROM design_jobs WHERE id = ?`).get(jobId)) as JobRow | undefined;
    if (!j || j.user_id !== userId) throw notFound('DESIGN_JOB_NOT_FOUND', 'Generasiya tapılmadı');
    if (withHtml) {
      if (j.status !== 'SUCCEEDED' || !j.html) throw conflict('DESIGN_NOT_READY', 'Nəticə hələ hazır deyil');
      return { jobId: j.id, screenId: j.screen_id, html: j.html };
    }
    return this.toJob(j);
  }

  // İmzalı preview URL üçün (imza yoxlanılıb — sahiblik imzanın özündədir)
  async previewHtml(jobId: string): Promise<string> {
    const j = (await this.db.prepare(`SELECT html FROM design_jobs WHERE id = ? AND status = 'SUCCEEDED'`).get(jobId)) as { html: string } | undefined;
    if (!j) throw notFound('DESIGN_JOB_NOT_FOUND', 'Generasiya tapılmadı');
    return j.html;
  }

  // ---------------------------------------------------------------- arxa plan icrası
  private async execute(jobId: string): Promise<void> {
    const stitch = this.stitch!;
    const job = (await this.db.prepare(`SELECT * FROM design_jobs WHERE id = ?`).get(jobId)) as JobRow;
    const session = (await this.db.prepare(`SELECT * FROM design_sessions WHERE id = ?`).get(job.session_id)) as SessionRow;
    await this.db.prepare(`UPDATE design_jobs SET status = 'RUNNING', started_at = ? WHERE id = ?`).run(isoNow(this.now()), jobId);
    try {
      const projectId = session.stitch_project_id ?? (await stitch.createProject(`callbox-${session.id}`));
      const result =
        job.kind === 'EDIT' && session.current_screen_id
          ? await stitch.edit(projectId, session.current_screen_id, job.prompt, job.device_type)
          : await stitch.generate(projectId, job.prompt, job.device_type);
      const file = result.screen.htmlFile ?? (await stitch.getScreen(projectId, result.screen.id)).htmlFile;
      if (!file) throw new StitchError('UPSTREAM', 'Ekranın HTML faylı yoxdur');
      const html = sanitizeDesignHtml(await stitch.downloadHtml(file));
      const message = [result.message, result.suggestions.length ? `Təkliflər: ${result.suggestions.map((s) => `“${s}”`).join(', ')}` : null].filter(Boolean).join('\n\n') || null;
      const at = isoNow(this.now());
      await this.db
        .prepare(`UPDATE design_jobs SET status = 'SUCCEEDED', screen_id = ?, html = ?, message = ?, finished_at = ? WHERE id = ?`)
        .run(result.screen.id, html, message, at, jobId);
      await this.db
        .prepare(`UPDATE design_sessions SET current_screen_id = ?, stitch_project_id = ?, updated_at = ? WHERE id = ?`)
        .run(result.screen.id, projectId, at, session.id);
    } catch (err) {
      const d = describe(err);
      if (!(err instanceof StitchError)) console.error(`[design] ${jobId}:`, err);
      await this.db
        .prepare(`UPDATE design_jobs SET status = 'FAILED', error_code = ?, error_message = ?, credits = CASE WHEN ? THEN 0 ELSE credits END, finished_at = ? WHERE id = ?`)
        .run(d.code, d.message, d.refund, isoNow(this.now()), jobId);
    }
  }
}
