// npm run classroom:check [-- --lan] — sinif üçün hazırlıq yoxlaması. Heç nəyi dəyişmir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../server/src/config.js';
import { classroomChecks, suggestedLanEnv } from '../server/src/lib/classroom.js';
import { detectTools } from '../server/src/modules/materials/tools.js';

const lan = process.argv.includes('--lan');
const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i): i is os.NetworkInterfaceInfo => Boolean(i && i.family === 'IPv4' && !i.internal))
  .map((i) => i.address);
const tools = detectTools(config);
const checks = classroomChecks({
  config,
  lan,
  lanIps,
  portalBuilt: fs.existsSync(path.join(config.webDist, 'index.html')),
  tools: { pdftoppm: Boolean(tools.pdftoppm), soffice: Boolean(tools.soffice) },
});

const icon = { ok: '✓', warn: '⚠', fail: '✗' } as const;
console.log(`\nAPI Lab — sinif hazırlığı (${lan ? 'LAN rejimi üçün' : 'cari konfiqurasiya'})\n`);
for (const c of checks) console.log(`  ${icon[c.level]} ${c.item.padEnd(20)} ${c.detail}`);
const fails = checks.filter((c) => c.level === 'fail').length;
console.log(`\n${fails ? `${fails} problem — düzəldin.` : 'Hazırdır.'}${lanIps.length ? `  Bu kompüterin IP-ləri: ${lanIps.join(', ')}` : ''}`);
if (lan && fails && lanIps[0]) console.log(`\n${suggestedLanEnv(lanIps[0], config.port)}\n\n(Sirlər təsadüfi yaradılıb və heç yerə yazılmayıb. ADMIN_PASSWORD-u yadda saxlayın.)`);
process.exitCode = fails ? 1 : 0;
