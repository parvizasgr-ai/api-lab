// Callbox AI (Gemini) inteqrasiyasını yoxlamaq: npm run ai:check -- "Sualınız"
//   1. Birbaşa servis (GeminiService — server-in istifadə etdiyi eyni kod: retry/backoff, fallback)
//   2. Server işləyirsə, HTTP ilə: token → POST /api/v1/ai/chat (portalın etdiyi kimi)
import { config } from '../server/src/config.js';
import { GeminiService } from '../server/src/modules/ai/gemini.js';
import { SYSTEM_INSTRUCTION } from '../server/src/modules/ai/routes.js';

const question = process.argv.slice(2).join(' ') || 'Bir cümlə ilə izah et: REST API nədir?';

if (!config.ai.apiKey) {
  console.error('✖ GEMINI_API_KEY .env faylında yoxdur (bax .env.example)');
  process.exit(1);
}
console.log(`Model: ${config.ai.model} (fallback: ${config.ai.fallbackModels.join(', ')})`);
console.log(`Sual:  ${question}\n`);

const ai = new GeminiService({ ...config.ai, systemInstruction: SYSTEM_INSTRUCTION });
const started = Date.now();
try {
  const res = await ai.chat([{ role: 'user', text: question }]);
  console.log(`✔ 1) Servis: ${res.model}, ${res.attempts} cəhd, ${Date.now() - started} ms, tokenlər: ${res.usage?.totalTokens ?? '?'}`);
  console.log(`\n${res.text}\n`);
} catch (err) {
  const e = err as { status?: number; code?: string; message: string };
  console.error(`✖ 1) Servis xətası: ${e.status ?? ''} ${e.code ?? ''} — ${e.message}`);
  process.exit(1);
}

// 2) HTTP (server işləyirsə)
const base = config.publicUrl;
try {
  const tokenRes = await fetch(`${base}/realms/callbox/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: config.publicClientId, username: 'student', password: 'student123' }),
  });
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const res = await fetch(`${base}/api/v1/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ messages: [{ role: 'user', text: 'Salam! Callbox AI işləyir? Bir sözlə cavab ver.' }] }),
  });
  const body = (await res.json()) as { reply?: { text: string }; model?: string; code?: string; message?: string };
  console.log(res.ok ? `✔ 2) HTTP POST /api/v1/ai/chat → ${res.status} (${body.model}): ${body.reply?.text}` : `✖ 2) HTTP → ${res.status} ${body.code}: ${body.message}`);
} catch {
  console.log(`– 2) Server ${base}-da işləmir — HTTP yoxlaması buraxıldı (npm run dev)`);
}
