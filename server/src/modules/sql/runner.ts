// Sorğunu child process-də icra edir; limit aşılarsa prosesi öldürür (SIGKILL) → 422 SQL_TIMEOUT.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../../errors.js';
import { HIDDEN_COLUMNS } from './hidden.js';

const WORKER = fileURLToPath(new URL('./worker.mjs', import.meta.url));

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  hiddenColumns: string[];
  truncated: boolean;
  durationMs: number;
}

export function runInWorker(snapshot: Buffer, sql: string, limits: { timeoutMs: number; maxRows: number; maxBytes: number }): Promise<QueryResult> {
  return new Promise((resolve, reject) => {
    // execArgv: [] — worker adi Node prosesidir (tsx/vitest loader-ləri ötürülmür), .mjs faylı birbaşa işləyir
    const child = fork(WORKER, [], { serialization: 'advanced', execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new ApiError(422, 'SQL_TIMEOUT', `Sorğu ${limits.timeoutMs} ms-dən çox çəkdi və dayandırıldı`))),
      limits.timeoutMs,
    );

    child.once('message', (msg: any) =>
      finish(() => {
        if (msg.ok) return resolve(msg as QueryResult);
        if (msg.code === 'SQLITE_READONLY') return reject(new ApiError(422, 'SQL_NOT_ALLOWED', 'Yalnız SELECT sorğularına icazə verilir'));
        reject(new ApiError(422, 'SQL_SYNTAX_ERROR', msg.message));
      }),
    );
    child.once('error', (err) => finish(() => reject(err)));
    child.once('exit', (code) => finish(() => reject(new Error(`SQL worker gözlənilmədən dayandı (exit ${code})`))));
    child.send({ buffer: snapshot, sql, hidden: HIDDEN_COLUMNS, maxRows: limits.maxRows, maxBytes: limits.maxBytes });
  });
}
