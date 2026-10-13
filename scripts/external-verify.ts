// npm run external:verify — RAPIDAPI_KEY ilə kataloqdakı hər API-yə bir sorğu; verified bayrağı üçün TƏKLİF çap edir.
// catalog.ts AVTOMATİK DƏYİŞMİR. Açar heç yerə yazılmır, ekranda yalnız maskalanmış forması görünür.
import { config } from '../server/src/config.js';
import { EXTERNAL_CATALOG } from '../server/src/modules/external/catalog.js';
import { maskKey } from '../server/src/modules/external/proxy.js';
import { verifyCatalog } from '../server/src/modules/external/verify.js';

const key = process.env.RAPIDAPI_KEY ?? config.external.serverKey;
if (!key) {
  console.error('RAPIDAPI_KEY yoxdur. .env faylına RAPIDAPI_KEY=... yazın (rapidapi.com → Apps → Authorization) və yenidən işlədin.');
  process.exit(1);
}

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const catalog = only ? EXTERNAL_CATALOG.filter((a) => only.includes(a.id)) : EXTERNAL_CATALOG;
console.log(`RapidAPI açarı: ${maskKey(key)} — ${catalog.length} API yoxlanılır (hər birinə 1 sorğu)…\n`);

const rows = await verifyCatalog(catalog, key, fetch);
console.table(rows.map((r) => ({ API: r.id, host: r.host, sorğu: r.request, status: r.status ?? '—', ms: r.ms, nəticə: r.verdict, 'verified indi': r.current, təklif: r.proposed })));

const changes = rows.filter((r) => r.current !== r.proposed);
console.log('\nİzahlar:');
for (const r of rows) console.log(`  ${r.id.padEnd(10)} ${r.verdict.padEnd(18)} ${r.hint}`);
if (changes.length) {
  console.log('\nTəklif olunan dəyişikliklər (server/src/modules/external/catalog.ts — əl ilə):');
  for (const r of changes) console.log(`  ${r.id}: verified: ${r.current} → ${r.proposed}`);
} else {
  console.log('\nDəyişiklik təklif olunmur.');
}
