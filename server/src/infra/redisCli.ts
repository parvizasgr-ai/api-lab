// redis-cli kimi əmr sətri: tokenizer + icazə siyahısı + cavabın redis-cli formatında göstərilməsi.
// Oxu əmrləri istənilən açara (keş, rate limit, statistika); yazma əmrləri YALNIZ tələbənin öz sandbox:<username>:* açarlarına.
import { RedisError, type RedisSim } from './redis.js';

export class RedisCommandError extends Error {
  constructor(
    message: string,
    readonly code: 'REDIS_COMMAND_NOT_ALLOWED' | 'REDIS_ERROR',
  ) {
    super(message);
  }
}

export function tokenize(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    const quote = line[i] === '"' || line[i] === "'" ? line[i] : null;
    let token = '';
    if (quote) {
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === '\\' && quote === '"' && i + 1 < line.length) i++;
        token += line[i++];
      }
      if (line[i] !== quote) throw new RedisCommandError('ERR unbalanced quotes in request', 'REDIS_ERROR');
      i++;
    } else {
      while (i < line.length && !/\s/.test(line[i])) token += line[i++];
    }
    out.push(token);
  }
  return out;
}

export const READ_COMMANDS = ['GET', 'TTL', 'EXISTS', 'TYPE', 'KEYS', 'DBSIZE', 'STRLEN', 'PING'];
export const WRITE_COMMANDS = ['SET', 'DEL', 'INCR', 'INCRBY', 'DECR', 'EXPIRE', 'PERSIST'];
const BLOCKED_HINT: Record<string, string> = {
  FLUSHALL: 'bütün datanı silər',
  FLUSHDB: 'bütün datanı silər',
  CONFIG: 'server konfiqurasiyası',
  EVAL: 'server tərəfində skript icrası',
  SCRIPT: 'server tərəfində skript',
  SHUTDOWN: 'serveri dayandırar',
  DEBUG: 'server daxili əmrləri',
  MONITOR: 'bütün əmrləri izləyər',
};

export type RedisResult = string | number | null | string[];

// redis-cli çıxışı: OK, (integer) 5, (nil), "dəyər", 1) "a"
export function display(result: RedisResult): string {
  if (result === null) return '(nil)';
  if (typeof result === 'number') return `(integer) ${result}`;
  if (Array.isArray(result)) return result.length ? result.map((r, i) => `${i + 1}) ${JSON.stringify(r)}`).join('\n') : '(empty array)';
  return JSON.stringify(result);
}

export interface SandboxLimits {
  redisKeys: number;
  redisValueChars: number;
}

export function runCommand(redis: RedisSim, line: string, username: string, limits: SandboxLimits): { result: RedisResult; display: string } {
  const args = tokenize(line);
  if (!args.length) throw new RedisCommandError('ERR empty command', 'REDIS_ERROR');
  const name = args[0].toUpperCase();
  const rest = args.slice(1);
  const own = `sandbox:${username}:`;
  const allowed = [...READ_COMMANDS, ...WRITE_COMMANDS].join(', ');

  const arity = (min: number, max = min) => {
    if (rest.length < min || rest.length > max) throw new RedisCommandError(`ERR wrong number of arguments for '${name.toLowerCase()}' command`, 'REDIS_ERROR');
  };
  const int = (v: string) => {
    if (!/^-?\d+$/.test(v)) throw new RedisCommandError('ERR value is not an integer or out of range', 'REDIS_ERROR');
    return Number(v);
  };
  const writable = (key: string) => {
    if (!key.startsWith(own)) {
      throw new RedisCommandError(
        `Yazma yalnız öz açarlarınıza icazəlidir: ${own}* (məs. SET ${own}salam "dünya"). Keş və rate limit açarlarını yalnız oxumaq olar.`,
        'REDIS_COMMAND_NOT_ALLOWED',
      );
    }
    if (key.length > 100) throw new RedisCommandError('Açar ən çox 100 simvol ola bilər', 'REDIS_COMMAND_NOT_ALLOWED');
  };
  const roomFor = (key: string) => {
    if (!redis.exists(key) && redis.keys(`${own}*`).length >= limits.redisKeys) {
      throw new RedisCommandError(`Sandbox-da ən çox ${limits.redisKeys} açar ola bilər — köhnələri DEL ilə silin`, 'REDIS_COMMAND_NOT_ALLOWED');
    }
  };
  // Başqa tələbələrin sandbox açarları gizlidir (oxumaq da olmaz)
  const visible = (key: string) => !key.startsWith('sandbox:') || key.startsWith(own);
  const readable = (key: string) => {
    if (!visible(key)) throw new RedisCommandError('Başqa istifadəçinin sandbox açarlarını oxumaq olmaz', 'REDIS_COMMAND_NOT_ALLOWED');
  };
  const reply = (result: RedisResult, text = display(result)) => ({ result, display: text });

  if (!READ_COMMANDS.includes(name) && !WRITE_COMMANDS.includes(name)) {
    const hint = BLOCKED_HINT[name];
    throw new RedisCommandError(
      hint ? `${name} icazəli deyil — ${hint}. İcazəli əmrlər: ${allowed}` : `ERR unknown or not allowed command '${args[0]}'. İcazəli əmrlər: ${allowed}`,
      'REDIS_COMMAND_NOT_ALLOWED',
    );
  }

  try {
    switch (name) {
      case 'PING':
        arity(0, 1);
        return rest[0] ? reply(rest[0]) : reply('PONG', 'PONG');
      case 'GET':
        arity(1);
        readable(rest[0]);
        return reply(redis.get(rest[0]));
      case 'STRLEN':
        arity(1);
        readable(rest[0]);
        return reply(redis.get(rest[0])?.length ?? 0);
      case 'TTL':
        arity(1);
        readable(rest[0]);
        return reply(redis.ttl(rest[0]));
      case 'EXISTS':
        arity(1, 10);
        rest.forEach(readable);
        return reply(redis.exists(...rest));
      case 'TYPE': {
        arity(1);
        readable(rest[0]);
        const t = redis.exists(rest[0]) ? 'string' : 'none';
        return reply(t, t);
      }
      case 'KEYS':
        arity(1);
        return reply(redis.keys(rest[0]).filter(visible).slice(0, 200));
      case 'DBSIZE':
        arity(0);
        return reply(redis.dbsize());
      case 'SET': {
        if (rest.length < 2) arity(2);
        const [key, value, ...opts] = rest;
        writable(key);
        if (value.length > limits.redisValueChars) throw new RedisCommandError(`Dəyər ən çox ${limits.redisValueChars} simvol ola bilər`, 'REDIS_COMMAND_NOT_ALLOWED');
        let ex: number | undefined;
        let nx = false;
        for (let i = 0; i < opts.length; i++) {
          const o = opts[i].toUpperCase();
          if (o === 'EX' && opts[i + 1] !== undefined) ex = int(opts[++i]);
          else if (o === 'NX') nx = true;
          else throw new RedisCommandError('ERR syntax error (dəstəklənən: SET key value [EX saniyə] [NX])', 'REDIS_ERROR');
        }
        if (ex !== undefined && (ex < 1 || ex > 86_400)) throw new RedisCommandError('EX 1–86400 saniyə olmalıdır', 'REDIS_COMMAND_NOT_ALLOWED');
        roomFor(key);
        return redis.set(key, value, { ex, nx }) ? reply('OK', 'OK') : reply(null);
      }
      case 'DEL':
        arity(1, 10);
        rest.forEach(writable);
        return reply(redis.del(...rest));
      case 'INCR':
      case 'DECR':
      case 'INCRBY': {
        arity(name === 'INCRBY' ? 2 : 1);
        writable(rest[0]);
        roomFor(rest[0]);
        return reply(redis.incr(rest[0], name === 'DECR' ? -1 : name === 'INCRBY' ? int(rest[1]) : 1));
      }
      case 'EXPIRE': {
        arity(2);
        writable(rest[0]);
        const sec = int(rest[1]);
        if (sec < 1 || sec > 86_400) throw new RedisCommandError('EXPIRE 1–86400 saniyə olmalıdır', 'REDIS_COMMAND_NOT_ALLOWED');
        return reply(redis.expire(rest[0], sec) ? 1 : 0);
      }
      case 'PERSIST':
        arity(1);
        writable(rest[0]);
        return reply(redis.persist(rest[0]) ? 1 : 0);
    }
  } catch (err) {
    if (err instanceof RedisError) throw new RedisCommandError(err.message, 'REDIS_ERROR');
    throw err;
  }
  throw new RedisCommandError(`ERR unknown command '${args[0]}'`, 'REDIS_ERROR');
}
