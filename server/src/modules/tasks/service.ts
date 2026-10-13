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

  private load(userId: number, id: number) {
    const t = tasksRepo.get(this.db, userId, id);
    if (!t) throw notFound('TASK_NOT_FOUND', 'Tapşırıq tapılmadı');
    return t;
  }

  // Tapşırığın SQL yoxlaması da SQL Playground qaydalarına uyğun olmalıdır (yalnız SELECT)
  private fields(input: TaskInput): TaskFields {
    if (input.sqlCheck) guardQuery(input.sqlCheck, 200);
    if (input.materialId && !tasksRepo.materialExists(this.db, input.materialId)) throw notFound('MATERIAL_NOT_FOUND', 'Material tapılmadı');
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

  private unique<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('TASK_EXISTS', 'Bu dərsdə eyni başlıqlı tapşırıq artıq var');
      throw err;
    }
  }

  list(auth: AuthContext, lesson?: number) {
    return { items: tasksRepo.list(this.db, auth.userId, lesson).map(toTask) };
  }

  create(auth: AuthContext, input: TaskInput) {
    const id = this.unique(() => tasksRepo.insert(this.db, { ...this.fields(input), at: this.now() }));
    return toTask(this.load(auth.userId, id));
  }

  update(auth: AuthContext, id: number, patch: Partial<TaskInput>) {
    const t = this.load(auth.userId, id);
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
    this.unique(() => tasksRepo.update(this.db, id, { ...this.fields(merged), at: this.now() }));
    return toTask(this.load(auth.userId, id));
  }

  delete(id: number) {
    if (tasksRepo.delete(this.db, id) === 0) throw notFound('TASK_NOT_FOUND', 'Tapşırıq tapılmadı');
  }

  setProgress(auth: AuthContext, taskId: number, done: boolean) {
    this.load(auth.userId, taskId);
    if (done) tasksRepo.markDone(this.db, auth.userId, taskId, this.now());
    else tasksRepo.markUndone(this.db, auth.userId, taskId);
    const t = this.load(auth.userId, taskId);
    return { taskId, done: t.done_at !== null, doneAt: t.done_at };
  }

  myProgress(auth: AuthContext) {
    const byLesson = tasksRepo.summary(this.db, auth.userId);
    const items = tasksRepo
      .list(this.db, auth.userId)
      .filter((t) => t.done_at)
      .map((t) => ({ taskId: t.id, done: true, doneAt: t.done_at }));
    return { total: byLesson.reduce((n, l) => n + l.total, 0), done: items.length, byLesson, items };
  }

  // Bütün fayl bir transaction-dadır: bir tapşırıq səhvdirsə, heç nə yazılmır
  import(req: Request) {
    const f = req.file!;
    inspectFile(f.path, f.originalname, f.mimetype, ['md']);
    const parsed = parseTaskMarkdown(fs.readFileSync(f.path, 'utf8'));
    let created = 0;
    let updated = 0;
    const ids = this.db.transaction(() =>
      parsed.map((p, i) => {
        const existing = tasksRepo.findByTitle(this.db, p.lesson, p.title);
        const fields = this.fields({ ...p, sortOrder: p.sortOrder ?? i + 1 });
        if (existing) {
          const current = this.load(req.auth!.userId, existing.id);
          tasksRepo.update(this.db, existing.id, { ...fields, material_id: current.material_id, at: this.now() });
          updated++;
          return existing.id;
        }
        created++;
        return tasksRepo.insert(this.db, { ...fields, at: this.now() });
      }),
    )();
    return { created, updated, tasks: ids.map((id) => toTask(this.load(req.auth!.userId, id))) };
  }
}
