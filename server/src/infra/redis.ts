// Redis simulyasiyası (proses daxilində). Real Redis kimi: açar → dəyər (string), TTL (EXPIRE / SET … EX), INCR, KEYS pattern.
// Tədris üçün: keş (cache-aside, X-Cache: HIT/MISS) və rate limit sayğacları buradadır; portal "Infrastruktur → Redis"
// açarları, TTL-i və hit/miss statistikasını göstərir. Vaxt config.now()-dan gəlir (testlərdə saxta saat).
// Real Redis kimi yaddaşdadır: server yenidən başlayanda boşalır.

export type RedisValue = string;

interface Entry {
  value: RedisValue;
  expiresAt: number | null; // epoch ms, null — vaxtsız
}

export interface RedisStats {
  keys: number;
  hits: number;
  misses: number;
  commands: number;
  expired: number;
}

// Redis glob pattern-i: * ? [abc] \x
export function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') out += '.*';
    else if (c === '?') out += '.';
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) out += '\\[';
      else {
        out += `[${pattern.slice(i + 1, end).replace(/\\/g, '\\\\')}]`;
        i = end;
      }
    } else if (c === '\\' && i + 1 < pattern.length) out += `\\${pattern[++i]}`;
    else out += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 's');
}

export class RedisSim {
  private data = new Map<string, Entry>();
  private stats = { hits: 0, misses: 0, commands: 0, expired: 0 };

  constructor(private now: () => Date) {}

  private ms() {
    return this.now().getTime();
  }

  // Vaxtı keçmiş açar oxunanda silinir (Redis-in "lazy expiration"-ı)
  private entry(key: string): Entry | undefined {
    const e = this.data.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= this.ms()) {
      this.data.delete(key);
      this.stats.expired++;
      return undefined;
    }
    return e;
  }

  private sweep() {
    for (const key of [...this.data.keys()]) this.entry(key);
  }

  get(key: string): RedisValue | null {
    this.stats.commands++;
    return this.entry(key)?.value ?? null;
  }

  // Keş üçün: GET + hit/miss statistikası
  cacheGet(key: string): RedisValue | null {
    const value = this.get(key);
    if (value === null) this.stats.misses++;
    else this.stats.hits++;
    return value;
  }

  set(key: string, value: RedisValue, options: { ex?: number; nx?: boolean } = {}): boolean {
    this.stats.commands++;
    if (options.nx && this.entry(key)) return false;
    this.data.set(key, { value, expiresAt: options.ex ? this.ms() + options.ex * 1000 : null });
    return true;
  }

  del(...keys: string[]): number {
    this.stats.commands++;
    let n = 0;
    for (const key of keys) if (this.entry(key) && this.data.delete(key)) n++;
    return n;
  }

  exists(...keys: string[]): number {
    this.stats.commands++;
    return keys.filter((key) => this.entry(key)).length;
  }

  // INCR: yoxdursa 0-dan başlayır; rəqəm deyilsə xəta (Redis kimi)
  incr(key: string, by = 1): number {
    this.stats.commands++;
    const e = this.entry(key);
    const current = e ? Number(e.value) : 0;
    if (!Number.isInteger(current)) throw new RedisError('ERR value is not an integer or out of range');
    const next = current + by;
    this.data.set(key, { value: String(next), expiresAt: e?.expiresAt ?? null });
    return next;
  }

  expire(key: string, seconds: number): boolean {
    this.stats.commands++;
    const e = this.entry(key);
    if (!e) return false;
    e.expiresAt = this.ms() + seconds * 1000;
    return true;
  }

  persist(key: string): boolean {
    this.stats.commands++;
    const e = this.entry(key);
    if (!e || e.expiresAt === null) return false;
    e.expiresAt = null;
    return true;
  }

  // TTL: -2 açar yoxdur, -1 vaxtsız, əks halda qalan saniyə
  ttl(key: string): number {
    this.stats.commands++;
    const e = this.entry(key);
    if (!e) return -2;
    if (e.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((e.expiresAt - this.ms()) / 1000));
  }

  keys(pattern = '*'): string[] {
    this.stats.commands++;
    this.sweep();
    const re = globToRegExp(pattern);
    return [...this.data.keys()].filter((k) => re.test(k)).sort();
  }

  delPattern(pattern: string): number {
    const keys = this.keys(pattern);
    return keys.length ? this.del(...keys) : 0;
  }

  dbsize(): number {
    this.sweep();
    return this.data.size;
  }

  flushall() {
    this.data.clear();
    this.stats = { hits: 0, misses: 0, commands: 0, expired: 0 };
  }

  info(): RedisStats {
    return { keys: this.dbsize(), ...this.stats };
  }

  // Keş köməkçisi (cache-aside): varsa keşdən, yoxdursa load() → keşə yaz (TTL)
  async cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const raw = this.cacheGet(key);
    if (raw !== null) return { value: JSON.parse(raw) as T, hit: true };
    const value = await load();
    this.set(key, JSON.stringify(value), { ex: ttlSec });
    return { value, hit: false };
  }
}

export class RedisError extends Error {}
