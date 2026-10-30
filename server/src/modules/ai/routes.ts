// Callbox AI chat endpoint-ləri. Söhbət tarixçəsi serverdə saxlanılmır (portal brauzerdə saxlayır və hər sorğuda göndərir) —
// server yalnız Gemini-yə ötürür. Mesaj mətni request_log-a yazılmır (yalnız metod, yol, status).
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { ApiError } from '../../errors.js';
import type { ChatMessage } from './gemini.js';

export const SYSTEM_INSTRUCTION = `Sən "Callbox AI"-san — Div Academy / UNEC-in IT Business Analyst kursunun tələbələrinə kömək edən müəllim köməkçisisən.
Mövzular: API-lər (REST, HTTP metodları, status kodları, JSON, OpenAPI, Postman), autentifikasiya (JWT, OAuth 2.0, API key),
SQL və verilənlər bazası, biznes analiz (user story, acceptance criteria, BPMN, use case, tələblərin toplanması), Kafka, Redis, MongoDB.
Qaydalar:
- Tələbə hansı dildə yazırsa, o dildə cavab ver (default: Azərbaycan dili).
- Qısa və aydın izah et, lazım olanda Markdown (siyahı, cədvəl, \`kod\`, kod bloku) və kiçik nümunə istifadə et.
- Callbox-dakı nümunələrə istinad edə bilərsən: API Reference (/reference), Callbox GUI (/callbox), SQL Playground (/sql),
  məs. POST /realms/callbox/protocol/openid-connect/token, GET /api/v2/exchange-rates?from=USD&to=AZN.
- Tapşırığın hazır cavabını vermək əvəzinə tələbəni addım-addım düşündür; bilmədiyin şeyi uydurma.`;

export function aiHandlers({ ai, config }: AppContext): Handlers {
  return {
    aiStatus: (_req, res) => {
      res.json({ configured: ai.configured, model: ai.model, maxChars: config.ai.maxChars });
    },

    aiChat: async (req, res) => {
      const { messages } = req.valid.body as { messages: ChatMessage[] };
      if (messages[messages.length - 1].role !== 'user') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Son mesaj tələbənin (role: user) olmalıdır', [{ field: 'messages', message: 'Son element role=user olmalıdır' }]);
      }
      if (messages.some((m) => !m.text.trim())) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Boş mesaj göndərmək olmaz', [{ field: 'messages', message: 'text boş ola bilməz' }]);
      }
      const started = Date.now();
      const result = await ai.chat(messages.slice(-config.ai.maxMessages));
      res.json({
        reply: { role: 'model', text: result.text },
        model: result.model,
        attempts: result.attempts,
        usage: result.usage,
        durationMs: Date.now() - started,
      });
    },
  };
}
