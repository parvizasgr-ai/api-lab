// SQL Playground icraçısı — AYRICA PROSESDƏ işləyir (child_process.fork).
// Səbəb: better-sqlite3 sinxrondur, uzun sorğunu (məs. böyük CROSS JOIN) eyni prosesdə dayandırmaq olmur.
// Ayrıca proses isə timeout-da SIGKILL ilə dərhal öldürülür, əsas server bloklanmır.
//
// Addımlar: DB surəti (buffer) → gizli sütunları '[hidden#rowid]' ilə əvəz et → readonly bağlantı → sorğu.
// Gizli dəyərlər surətdə artıq yoxdur, ona görə substr(), CTE ilə ad dəyişmə və s. də heç nə sızdırmır.
import Database from 'better-sqlite3';

process.once('message', ({ buffer, sql, hidden, maxRows, maxBytes }) => {
  try {
    const snapshot = Buffer.from(buffer);
    snapshot[18] = 1; // WAL → legacy jurnal (in-memory bağlantı WAL faylı aça bilmir)
    snapshot[19] = 1;
    const scratch = new Database(snapshot);
    for (const { table, column } of hidden) {
      scratch.prepare(`UPDATE "${table}" SET "${column}" = '[hidden#' || rowid || ']'`).run();
    }
    const db = new Database(scratch.serialize(), { readonly: true });
    scratch.close();

    const started = performance.now();
    const stmt = db.prepare(sql);
    if (!stmt.reader) throw Object.assign(new Error('Yalnız oxuyan sorğular'), { code: 'SQLITE_READONLY' });

    // Gizli sütunlar nəticədən çıxarılır (origin: cədvəl.sütun — CTE/subquery-dən də keçir)
    const meta = stmt.columns();
    const seen = new Map();
    const columns = meta.map((c) => {
      const n = seen.get(c.name) ?? 0;
      seen.set(c.name, n + 1);
      return { name: n ? `${c.name}_${n + 1}` : c.name, hidden: hidden.some((h) => h.table === c.table && h.column === c.column), origin: `${c.table}.${c.column}` };
    });

    const rows = [];
    let bytes = 0;
    let truncated = false;
    for (const raw of stmt.raw(true).iterate()) {
      if (rows.length === maxRows) {
        truncated = true;
        break;
      }
      const row = {};
      raw.forEach((v, i) => {
        if (!columns[i].hidden) row[columns[i].name] = Buffer.isBuffer(v) ? `<blob ${v.length} bytes>` : v;
      });
      bytes += JSON.stringify(row).length;
      if (bytes > maxBytes) {
        truncated = true;
        break;
      }
      rows.push(row);
    }
    process.send({
      ok: true,
      columns: columns.filter((c) => !c.hidden).map((c) => c.name),
      hiddenColumns: [...new Set(columns.filter((c) => c.hidden).map((c) => c.origin))],
      rows,
      truncated,
      durationMs: Math.round(performance.now() - started),
    });
  } catch (err) {
    process.send({ ok: false, code: err.code ?? 'ERROR', message: err.message });
  }
});
