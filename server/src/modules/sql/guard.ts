// SQL Playground "qapıçısı": sorğunu icradan ƏVVƏL yoxlayır və LIMIT-i tətbiq edir.
import { ApiError } from '../../errors.js';
import { tokenize, type Token } from './tokenizer.js';

const FORBIDDEN = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE', 'UPSERT', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'ATTACH', 'DETACH', 'PRAGMA',
  'VACUUM', 'REINDEX', 'ANALYZE', 'CLUSTER', 'REFRESH', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'TRANSACTION',
  // PostgreSQL: rol/sessiya/fayl əmrləri (playground rolu onsuz da icra edə bilməz — əlavə qat)
  'COPY', 'GRANT', 'REVOKE', 'SET', 'RESET', 'LOCK', 'LISTEN', 'NOTIFY', 'UNLISTEN', 'DO', 'CALL', 'EXECUTE', 'PREPARE',
  'DEALLOCATE', 'DISCARD', 'COMMENT', 'SECURITY', 'IMPORT', 'LOAD', 'CHECKPOINT', 'INTO',
]);
// Fayl sistemi, şəbəkə, sessiya və proses funksiyaları (superuser hüququ tələb edir, playground rolunda yoxdur — əlavə qat)
const FORBIDDEN_FUNCTIONS = new Set([
  'load_extension', 'readfile', 'writefile', 'edit', 'fts3_tokenizer',
  'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'pg_stat_file', 'pg_ls_logdir', 'pg_ls_waldir', 'lo_import', 'lo_export',
  'lo_from_bytea', 'lo_put', 'dblink', 'dblink_exec', 'pg_terminate_backend', 'pg_cancel_backend', 'pg_reload_conf',
  'pg_rotate_logfile', 'set_config', 'pg_advisory_lock', 'pg_advisory_xact_lock', 'pg_notify', 'query_to_xml',
  'query_to_xml_and_xmlschema', 'cursor_to_xml', 'table_to_xml', 'database_to_xml',
]);

const notAllowed = (message: string, details: { field: string; message: string }[] = []) => new ApiError(422, 'SQL_NOT_ALLOWED', message, details);

export function guardQuery(sql: string, maxRows: number): { executedSql: string } {
  const tokens = tokenize(sql);

  // ';' ilə statement-lərə böl (string/şərh daxilindəki ';' artıq token deyil)
  const statements: Token[][] = [[]];
  for (const t of tokens) {
    if (t.type === 'punct' && t.value === ';') statements.push([]);
    else statements[statements.length - 1].push(t);
  }
  const nonEmpty = statements.filter((s) => s.length);
  if (!nonEmpty.length) throw new ApiError(422, 'SQL_SYNTAX_ERROR', 'Sorğu boşdur');
  if (nonEmpty.length > 1) throw notAllowed('Yalnız 1 SQL statement göndərilə bilər');
  const stmt = nonEmpty[0];

  if (stmt[0].type !== 'word' || !['SELECT', 'WITH'].includes(stmt[0].upper)) {
    throw notAllowed('Yalnız SELECT sorğularına icazə verilir', [{ field: 'sql', message: `Birinci açar söz: ${stmt[0].value}` }]);
  }
  for (let i = 0; i < stmt.length; i++) {
    const t = stmt[i];
    if (t.type !== 'word') continue;
    const isCall = stmt[i + 1]?.value === '(';
    if (FORBIDDEN.has(t.upper) && !(t.upper === 'REPLACE' && isCall)) {
      throw notAllowed('Yalnız SELECT sorğularına icazə verilir', [{ field: 'sql', message: `Qadağan olunmuş açar söz: ${t.upper}` }]);
    }
    if (isCall && FORBIDDEN_FUNCTIONS.has(t.value.toLowerCase())) {
      throw notAllowed('Bu funksiyaya icazə verilmir', [{ field: 'sql', message: t.value }]);
    }
  }

  // LIMIT: yalnız ən üst səviyyədəki (mötərizədən kənar) LIMIT nəzərə alınır.
  // maxRows + 1 sətir istəyirik ki, "truncated" olub-olmadığını bilək.
  const text = sql.slice(stmt[0].start, stmt[stmt.length - 1].end);
  const cap = String(maxRows + 1);
  let depth = 0;
  let limitAt = -1;
  stmt.forEach((t, i) => {
    if (t.value === '(') depth++;
    else if (t.value === ')') depth--;
    else if (depth === 0 && t.type === 'word' && t.upper === 'LIMIT') limitAt = i;
  });
  if (limitAt === -1) return { executedSql: `${text} LIMIT ${cap}` };

  // LIMIT n | LIMIT n OFFSET m | LIMIT m, n (vergüllü formada say ikincidir)
  const first = stmt[limitAt + 1];
  const count = stmt[limitAt + 2]?.value === ',' ? stmt[limitAt + 3] : first;
  if (count?.type !== 'number') return { executedSql: `SELECT * FROM (${text}) LIMIT ${cap}` };
  if (Number(count.value) <= maxRows) return { executedSql: text };
  const offset = stmt[0].start;
  return { executedSql: text.slice(0, count.start - offset) + cap + text.slice(count.end - offset) };
}
