// Tapşırıqlar: CRUD (ADMIN), irəliləyiş (hər istifadəçi özü üçün), markdown import (upsert).
import fs from 'node:fs';
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import { conflict, notFound } from '../../errors.js';
import { isoNow } from '../../lib/crypto.js';
import type { AuthContext } from '../../types.js';
import { guardQuery } from '../sql/guard.js';
import { inspectFile } from '../materials/fileCheck.js';
import { parseTaskMarkdown } from './markdown.js';
import { tasksRepo, type TaskFields, type TaskRow } from './repo.js';

interface TaskInput {
  lesson: number;
  title: string;
  descriptionMd?: string;
  method: string;
  path: string;
  expectedStatus: number;
  sqlCheck?: string | null;
  materialId?: number | null;
  sortOrder?: number;
}

export const toTask = (t: TaskRow) => ({
  id: t.id,
  lesson: t.lesson,
  title: t.title,
  descriptionMd: t.description_md,
  method: t.method,
  path: t.path,
  expectedStatus: t.expected_status,
  sqlCheck: t.sql_check,
  materialId: t.material_id,
  sortOrder: t.sort_order,
  done: t.done_at !== null,
  doneAt: t.done_at,
});

export class TasksService {
  constructor(private ctx: AppContext) {}

  private get db() {
    return this.ctx.db;
  }

  private now() {
    return isoNow(this.ctx.config.now());
  }

  private async load(userId: number, id: number) {
    const t = await tasksRepo.get(this.db, userId, id);
    if (!t) throw notFound('TASK_NOT_FOUND', 'Tapşırıq tapılmadı');
    return t;
  }

  // Tapşırığın SQL yoxlaması da SQL Playground qaydalarına uyğun olmalıdır (yalnız SELECT)
  private async fields(input: TaskInput): Promise<TaskFields> {
    if (input.sqlCheck) guardQuery(input.sqlCheck, 200);
    if (input.materialId && !(await tasksRepo.materialExists(this.db, input.materialId))) throw notFound('MATERIAL_NOT_FOUND', 'Material tapılmadı');
    return {
      lesson: input.lesson,
      title: input.title,
      description_md: input.descriptionMd ?? '',
      method: input.method,
      path: input.path,
      expected_status: input.expectedStatus,
      sql_check: input.sqlCheck ?? null,
      material_id: input.materialId ?? null,
      sort_order: input.sortOrder ?? 0,
    };
  }

  private async unique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('TASK_EXISTS', 'Bu dərsdə eyni başlıqlı tapşırıq artıq var');
      throw err;
    }
  }

  async list(auth: AuthContext, lesson?: number) {
    return { items: (await tasksRepo.list(this.db, auth.userId, lesson)).map(toTask) };
  }

  async create(auth: AuthContext, input: TaskInput) {
    const id = await this.unique(async () => tasksRepo.insert(this.db, { ...await this.fields(input), at: this.now() }));
    return toTask(await this.load(auth.userId, id));
  }

  async update(auth: AuthContext, id: number, patch: Partial<TaskInput>) {
    const t = await this.load(auth.userId, id);
    const merged: TaskInput = {
      lesson: patch.lesson ?? t.lesson,
      title: patch.title ?? t.title,
      descriptionMd: patch.descriptionMd ?? t.description_md,
      method: patch.method ?? t.method,
      path: patch.path ?? t.path,
      expectedStatus: patch.expectedStatus ?? t.expected_status,
      sqlCheck: patch.sqlCheck === undefined ? t.sql_check : patch.sqlCheck,
      materialId: patch.materialId === undefined ? t.material_id : patch.materialId,
      sortOrder: patch.sortOrder ?? t.sort_order,
    };
    await this.unique(async () => tasksRepo.update(this.db, id, { ...await this.fields(merged), at: this.now() }));
    return toTask(await this.load(auth.userId, id));
  }

  async delete(id: number) {
    if (await tasksRepo.delete(this.db, id) === 0) throw notFound('TASK_NOT_FOUND', 'Tapşırıq tapılmadı');
  }

  async setProgress(auth: AuthContext, taskId: number, done: boolean) {
    await this.load(auth.userId, taskId);
    if (done) await tasksRepo.markDone(this.db, auth.userId, taskId, this.now());
    else await tasksRepo.markUndone(this.db, auth.userId, taskId);
    const t = await this.load(auth.userId, taskId);
    return { taskId, done: t.done_at !== null, doneAt: t.done_at };
  }

  async myProgress(auth: AuthContext) {
    const byLesson = await tasksRepo.summary(this.db, auth.userId);
    const items = (await tasksRepo
          .list(this.db, auth.userId))
      .filter((t) => t.done_at)
      .map((t) => ({ taskId: t.id, done: true, doneAt: t.done_at }));
    return { total: byLesson.reduce((n, l) => n + l.total, 0), done: items.length, byLesson, items };
  }

  // Bütün fayl bir transaction-dadır: bir tapşırıq səhvdirsə, heç nə yazılmır
  async import(req: Request) {
    const f = req.file!;
    inspectFile(f.path, f.originalname, f.mimetype, ['md']);
    const parsed = parseTaskMarkdown(fs.readFileSync(f.path, 'utf8'));
    let created = 0;
    let updated = 0;
    const ids = await this.db.transaction(async () => {
      const out: number[] = [];
      for (const [i, p] of parsed.entries()) {
        const existing = await tasksRepo.findByTitle(this.db, p.lesson, p.title);
        const fields = await this.fields({ ...p, sortOrder: p.sortOrder ?? i + 1 });
        if (existing) {
          const current = await this.load(req.auth!.userId, existing.id);
          await tasksRepo.update(this.db, existing.id, { ...fields, material_id: current.material_id, at: this.now() });
          updated++;
          out.push(existing.id);
          continue;
        }
        created++;
        out.push(await tasksRepo.insert(this.db, { ...fields, at: this.now() }));
      }
      return out;
    })();
    const tasks = [];
    for (const id of ids) tasks.push(toTask(await this.load(req.auth!.userId, id)));
    return { created, updated, tasks };
  }
}
