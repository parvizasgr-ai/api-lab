// Sadə SQLite tokenizer-i. Məqsəd: açar sözləri yalnız REAL kod hissəsində axtarmaq —
// şərhlər (-- və /* */) atılır, string ('...') və quoted identifier ("...", `...`, [...]) daxilindəki mətn "söz" sayılmır.
// Regex ilə "DROP" axtarmaq yetərli deyil: 'SELECT ''DROP''' təhlükəsizdir, /* */DROP isə yox.
import { ApiError } from '../../errors.js';

export type TokenType = 'word' | 'string' | 'ident' | 'number' | 'param' | 'punct';

export interface Token {
  type: TokenType;
  value: string;
  upper: string;
  start: number;
  end: number;
}

const syntaxError = (message: string) => new ApiError(422, 'SQL_SYNTAX_ERROR', message);

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: TokenType, start: number, end: number) => {
    const value = sql.slice(start, end);
    tokens.push({ type, value, upper: value.toUpperCase(), start, end });
  };

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '-' && next === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
    } else if (c === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2);
      i = close === -1 ? sql.length : close + 2; // SQLite-da bağlanmamış /* sona qədər şərhdir
    } else if (c === "'" || ((c === 'x' || c === 'X') && next === "'")) {
      const start = i;
      i += c === "'" ? 1 : 2;
      for (;;) {
        if (i >= sql.length) throw syntaxError('Bağlanmamış string literal');
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") i += 2; // '' — escape olunmuş dırnaq
          else break;
        } else i++;
      }
      i++;
      push('string', start, i);
    } else if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      const start = i;
      i++;
      for (;;) {
        if (i >= sql.length) throw syntaxError('Bağlanmamış identifier');
        if (sql[i] === close) {
          if (close !== ']' && sql[i + 1] === close) i += 2;
          else break;
        } else i++;
      }
      i++;
      push('ident', start, i);
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(next ?? ''))) {
      const start = i;
      while (i < sql.length && /[0-9a-fA-FxX.eE+-]/.test(sql[i]) && !(sql[i] === '-' && !/[eE]/.test(sql[i - 1])) && !(sql[i] === '+' && !/[eE]/.test(sql[i - 1]))) i++;
      push('number', start, i);
    } else if (/[A-Za-z_\u0080-￿]/.test(c)) {
      const start = i;
      while (i < sql.length && /[A-Za-z0-9_$\u0080-￿]/.test(sql[i])) i++;
      push('word', start, i);
    } else if (c === '?' || c === ':' || c === '@' || c === '$') {
      const start = i;
      i++;
      while (i < sql.length && /[A-Za-z0-9_]/.test(sql[i])) i++;
      push('param', start, i);
    } else {
      push('punct', i, i + 1);
      i++;
    }
  }
  return tokens;
}
