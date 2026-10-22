// `npm run classroom:check` məntiqi: konfiqurasiyanın sinif üçün hazırlığı (yerli və ya LAN rejimi).
// Heç nə dəyişmir — yalnız yoxlayır və .env üçün TƏKLİF verir.
import crypto from 'node:crypto';
import type { Config } from '../config.js';
import { DEFAULT_JWT_SECRET, exposureProblems, isLoopbackHost } from './exposure.js';

export type Level = 'ok' | 'warn' | 'fail';
export interface Check {
  level: Level;
  item: string;
  detail: string;
}

export interface ClassroomInput {
  config: Pick<Config, 'host' | 'port' | 'publicUrl' | 'jwtSecret' | 'adminPassword' | 'trustedProxies' | 'corsOrigins' | 'rateLimit'> & {
    external: Pick<Config['external'], 'serverKeyEnabled' | 'serverKey'>;
  };
  lan: boolean; // --lan: LAN rejimi üçün qiymətləndir (HOST hələ loopback olsa belə)
  lanIps: string[]; // bu kompüterin IPv4 ünvanları (192.168.x.x və s.)
  portalBuilt: boolean;
  tools: { pdftoppm: boolean; soffice: boolean };
}

export function classroomChecks(input: ClassroomInput): Check[] {
  const { config } = input;
  const exposed = !isLoopbackHost(config.host);
  const lan = input.lan || exposed;
  const checks: Check[] = [];
  const add = (level: Level, item: string, detail: string) => checks.push({ level, item, detail });

  add('ok', 'Rejim', lan ? `LAN — tələbələr ${config.publicUrl} ünvanına qoşulur` : `Yerli — server yalnız bu kompüterdə (HOST=${config.host})`);
  if (lan && !exposed) add('fail', 'HOST', `HOST=${config.host} — LAN üçün HOST=0.0.0.0 olmalıdır`);
  else add('ok', 'HOST', `${config.host}:${config.port}`);

  const problems = exposureProblems({ ...config, host: lan ? '0.0.0.0' : config.host });
  const jwtProblem = problems.find((p) => p.startsWith('JWT_SECRET'));
  if (jwtProblem) add('fail', 'JWT_SECRET', jwtProblem);
  else add(config.jwtSecret === DEFAULT_JWT_SECRET ? 'warn' : 'ok', 'JWT_SECRET', config.jwtSecret === DEFAULT_JWT_SECRET ? 'Default (yerli rejimdə qəbul olunur)' : `Fərdi (${config.jwtSecret.length} simvol)`);
  const adminProblem = problems.find((p) => p.startsWith('ADMIN_PASSWORD'));
  if (adminProblem) add('fail', 'ADMIN_PASSWORD', adminProblem);
  else add(config.adminPassword ? 'ok' : 'warn', 'ADMIN_PASSWORD', config.adminPassword ? 'Verilib (başlanğıcda və /_reset-dən sonra tətbiq olunur)' : 'Yoxdur — admin/admin123 (yalnız yerli rejim üçün)');

  if (lan) {
    const host = new URL(config.publicUrl).hostname;
    if (isLoopbackHost(host)) add('fail', 'PUBLIC_URL', `${config.publicUrl} — tələbələr "localhost"-a qoşula bilməz; LAN IP yazın${input.lanIps[0] ? ` (məs. http://${input.lanIps[0]}:${config.port})` : ''}`);
    else if (input.lanIps.length && !input.lanIps.includes(host)) add('warn', 'PUBLIC_URL', `${host} bu kompüterin IP-ləri arasında yoxdur (${input.lanIps.join(', ')}) — Wi-Fi dəyişibsə yeniləyin`);
    else add('ok', 'PUBLIC_URL', `${config.publicUrl} (OAuth callback-ləri avtomatik qəbul olunur)`);
    if (config.trustedProxies !== false) add('warn', 'TRUSTED_PROXIES', `${config.trustedProxies.join(',')} — nginx yoxdursa "none" qoyun (X-Forwarded-For saxtalaşdırılmasın)`);
    else add('ok', 'TRUSTED_PROXIES', 'none — X-Forwarded-For nəzərə alınmır');
  } else {
    add('ok', 'PUBLIC_URL', config.publicUrl);
  }

  add(config.corsOrigins.includes('*') ? 'warn' : 'ok', 'CORS_ORIGINS', config.corsOrigins.includes('*') ? '* — istənilən sayt brauzerdən API-ni oxuya bilər' : config.corsOrigins.length ? config.corsOrigins.join(', ') : 'localhost + PUBLIC_URL');
  add(config.rateLimit.limit < 30 ? 'warn' : 'ok', 'RATE_LIMIT_PER_MIN', `${config.rateLimit.limit}/dəq istifadəçi başına (anonim — IP başına)`);
  if (config.external.serverKeyEnabled) add(config.external.serverKey ? 'warn' : 'fail', 'External server key', config.external.serverKey ? 'Açıqdır — müəllimin RapidAPI kvotası bütün sinif üçün istifadə olunur (yalnız Hard Limit API)' : 'EXTERNAL_SERVER_KEY_ENABLED=true, amma RAPIDAPI_KEY yoxdur');
  else add('ok', 'External server key', 'Söndürülüb — hər tələbə öz RapidAPI açarı ilə');
  add(input.portalBuilt ? 'ok' : 'fail', 'Portal build', input.portalBuilt ? 'web/dist hazırdır' : 'web/dist yoxdur — cd web-design && corepack pnpm build');
  add(input.tools.pdftoppm ? 'ok' : 'warn', 'pdftoppm', input.tools.pdftoppm ? 'PDF slayd önizləməsi işləyir' : 'Yoxdur — PDF-lər yalnız endirmə (brew install poppler)');
  add(input.tools.soffice ? 'ok' : 'warn', 'LibreOffice', input.tools.soffice ? 'PPTX/DOCX önizləməsi işləyir' : 'Yoxdur — PPTX/DOCX önizləməsi olmayacaq (brew install --cask libreoffice)');
  return checks;
}

// LAN üçün hazır .env bloku (təsadüfi sirlərlə) — yalnız ekrana çap olunur, faylı dəyişmir
export function suggestedLanEnv(lanIp: string, port: number, random = (n: number) => crypto.randomBytes(n).toString('base64url')): string {
  return [
    '# --- Sinif (LAN) rejimi — .env faylına əlavə edin ---',
    'HOST=0.0.0.0',
    `PUBLIC_URL=http://${lanIp}:${port}`,
    `JWT_SECRET=${random(48)}`,
    `ADMIN_PASSWORD=${random(12)}`,
    'TRUSTED_PROXIES=none',
    'CORS_ORIGINS=',
  ].join('\n');
}
