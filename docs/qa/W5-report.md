# W5 — Avtomatik QA hesabatı

Tarix: 2026-10-13 · Əhatə: backend API, təhlükəsizlik, portal (e2e + a11y matrisi) · Əmr: `npm run test:all`

## Nəticə

| Qat | Keçdi | Skip | Qeyd |
|---|---|---|---|
| Backend (vitest, contract + security daxil) | 521 | 3 | skip: 2 multipart happy path (materials.test.ts-də real fayllarla yoxlanır), 1 PPTX (soffice yoxdur) |
| — onlardan contract (`tests/contract.test.ts`) | 257 | 2 | 90 əməliyyatın hamısı avtomatik |
| — onlardan security (`tests/security.test.ts`) | 42 | 0 | |
| Portal unit (vitest + happy-dom) | 43 | 0 | |
| E2E (Playwright, Chrome) | 31 | 4 | skip = `test.fixme`: QA-M05, QA-M06, QA-M07, QA-M08 (Medium, təsdiq gözləyir). Ümumi: 35 test (13 köhnə + 16 yeni axın + 6 matris) |
| E2E matris | 144 görünüş | — | 6 səhifə × 2 rol × 2 dil × 2 tema × 3 en; ekran görüntüləri `artifacts/e2e/` |

**Coverage**

| | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Backend (`server/src`) | 93.97% | 85.68% | 97.59% | 96.59% |
| Portal unit (`src/lib`, `src/api`) | 79.80% | 78.35% | 61.66% | 81.89% |

Portal UI komponentləri (`App.tsx`) unit coverage-ə daxil deyil — onlar e2e axınları və matrislə yoxlanır.

## Tapılan problemlər

Ciddilik: **Critical**: data itkisi və ya auth bypass. **High**: əsas axın işləmir, spec yalan deyir, ya da hər səhifədə xəta var. **Medium**: a11y/UX boşluğu, ya da məhdud şəraitdə təhlükəsizlik zəifliyi. **Low**: kosmetik, ya da qəsdən edilmiş tədris sadələşdirməsi.

Critical tapılmadı. Auth bypass, IDOR, SQLi, path traversal və XSS ssenarilərinin hamısı qorunur (security testləri).

| ID | Ciddilik | Yer | Təsvir | Status |
|---|---|---|---|---|
| QA-H01 | High | Portal, bütün səhifələr | Google Fonts CSS `@import` ilə yüklənirdi və CSP onu bloklayırdı. Nəticədə hər səhifədə console error var idi, Inter/JetBrains Mono yüklənmirdi. | ✅ Düzəldildi: fontlar lokaldır (`@fontsource`), CSP-dən xarici font domenləri çıxarıldı. Regresiya: matris (console error + `document.fonts.check`) |
| QA-H02 | High | Portal → Bank | "Kartı blokla" hər klikdə yeni `Idempotency-Key` yaradırdı, gözləmə zamanı düymə də aktiv qalırdı. İkiqat klik və ya itmiş cavabdan sonra təkrar cəhd uğurlu bloklamadan sonra yalançı 409 göstərirdi. Transfer-də isə forma dəyişəndə köhnə açar qalırdı və 422 `IDEMPOTENCY_KEY_REUSED` alınırdı. | ✅ Düzəldildi: açar niyyətə bağlıdır (eyni kart+səbəb+şərh → eyni açar, dəyişəndə yeni), düymə `disabled`/`aria-busy` olur. Regresiya: `flows.spec.ts` (3 test), `api.test.ts` |
| QA-H03 | High | OpenAPI | 15 GET endpoint naməlum query parametrinə 422 qaytarır, amma spec-də 422 yox idi (authMe, listAccounts, health…). | ✅ Spec düzəldildi. Regresiya: contract (hər GET üçün `?pgae=2` → 422) |
| QA-H04 | High | API + OpenAPI | 100 KB-dan böyük JSON/form body 400 `BAD_REQUEST` qaytarırdı (413 olmalıdır) və spec-də sənədləşdirilməmişdi. | ✅ 413 `PAYLOAD_TOO_LARGE` qaytarılır, 22 əməliyyatda `BodyTooLarge` var. Regresiya: contract (22 test) + security |
| QA-H05 | High | OpenAPI | `GET /materials/{id}/download` spec-də `application/octet-stream` yazılıb, real cavab `application/pdf` / PPTX MIME-dır. | ✅ Spec düzəldildi. Regresiya: contract (Content-Type yoxlaması) |
| QA-H06 | High | API/OpenAPI + Portal Customers | Telefonsuz müştəri üçün PUT 422 qaytarırdı: `Customer.phone` null ola bilir, `CustomerReplace` isə null qəbul etmirdi. Portalda PUT işləmirdi, GET→PUT round-trip pozulurdu. | ✅ `CustomerReplace.phone/city` nullable oldu. Regresiya: `customers.test.ts`, `flows.spec.ts` (CRUD) |
| QA-M09 | Medium | API auth | API key ilə qorunan endpoint-lərin 401 cavabında `WWW-Authenticate` yox idi (RFC 9110). | ✅ Düzəldildi (contract uyğunluğu üçün, bir sətir): `ApiKey realm="API Lab", header="X-API-Key"`. Regresiya: contract |
| QA-M01 | Medium | Portal, a11y | WCAG AA kontrast pozuntuları: Explorer `.environment-chip code` və mobil tab-lar; Home `.account-count`, `.table-avatar`; Auth Lab `.sequence-step` (light) və submit düymələri (dark); SQL `strong/small` (dark), `.sql-panel-head code` (light); Materials `small`, bölmə başlıqları, aktiv dərs filteri. | ⏳ Təsdiq gözləyir (design token-ləri dəyişir). Matrisdə "məlum" kimi qeyd olunur: `artifacts/e2e/known-*.json` |
| QA-M02 | Medium | Portal, a11y | Mobil endə Home dərs kartlarındakı ox linklərinin (`.lesson-footer a`) və footer brend linkinin əlçatan adı yoxdur. | ⏳ Təsdiq gözləyir |
| QA-M03 | Medium | Portal, a11y | `<html lang>` həmişə `az` qalır. EN rejimində ekran oxuyucusu mətni Azərbaycan dili kimi oxuyur (WCAG 3.1.1). | ⏳ Təsdiq gözləyir (1 sətir) |
| QA-M04 | Medium | Portal | URL routing yoxdur: nav linkləri `#explorer` göstərir, amma reload və ya paylaşılan link həmişə Home-u açır. | ⏳ Təsdiq gözləyir (hash routing) |
| QA-M05 | Medium | Portal → Bank | "Kartı blokla" modalı Escape ilə bağlanmır. | ⏳ `test.fixme` (flows.spec.ts) |
| QA-M06 | Medium | Portal → Müştərilər | Siyahı yüklənməyəndə xəta əvəzinə boş cədvəl görünür. Silmə xətası da göstərilmir (`finally` udur). | ⏳ `test.fixme` |
| QA-M07 | Medium | Portal → SQL | Schema yüklənməyəndə xəta göstərilmir ("Cədvəllər 0"). | ⏳ `test.fixme` |
| QA-M08 | Medium | Portal → Valyuta | Məzənnə yüklənməyəndə "1 AZN = 0.0000 USD · İndicə yeniləndi" göstərilir. Yanlış məlumatdır, xəta yoxdur. | ⏳ `test.fixme` |
| QA-M10 | Medium | API rate limit | `trust proxy = loopback`: eyni maşından (loopback) gələn klient `X-Forwarded-For` dəyişdirərək anonim rate limit-dən qaça bilir. Uzaq klientlərə təsir etmir. | ⏳ Təklif: `TRUST_PROXY` env, default söndürülmüş |
| QA-L01 | Low | Portal, a11y | Mobil endə `.table-scroll` klaviatura ilə scroll olunmur (`tabindex` yoxdur). | ⏳ |
| QA-L02 | Low | Portal | Dil seçimi yadda qalmır: reload-dan sonra yenə AZ açılır (tema isə yadda qalır). | ⏳ |
| QA-L03 | Low | Portal → Materials | Dərs filteri yadda qalmır (W3-dən məlum). | ⏳ |
| QA-L04 | Low | Portal footer | "© 2025 API Lab" yazılıb, il köhnədir. | ⏳ |
| QA-L05 | Low | Auth | Login üçün hesab üzrə kilidləmə yoxdur, yalnız ümumi 60/dəq IP limiti var. Seed parolları onsuz da açıqdır, ona görə tədris mühitində qəbul olunandır. | ⏳ Sənədləşdirmək |
| QA-L06 | Low | API logging | Material pre-signed URL-lərinin `exp&sig` hissəsi `request_log.path`-də saxlanılır. TTL bitənə qədər SQL Playground / `/_history` vasitəsilə görünür. | ⏳ Təklif: query-ni loga yazarkən `sig`-i maskalamaq |
| QA-L07 | Low | API CORS | CORS istənilən origin-i əks etdirir, amma `credentials` yoxdur (token başlıqdadır). Lokal lab üçün qəsdən belədir. | ℹ️ Qəbul edilmiş qərar |
| QA-L08 | Low | Auth | Logout-dan sonra access token ≤15 dəq etibarlı qalır (stateless JWT). Refresh token isə dərhal ləğv olunur. | ℹ️ Dizayn qərarı, dərsdə izah üçün |
| QA-L09 | Low | API Customers | PATCH `{"phone": null}` telefonu silə bilmir (sxem null qəbul etmir). | ⏳ |
| QA-L10 | Low | Portal → Müştərilər | Yalnız ilk 20 müştəri göstərilir, pagination UI yoxdur. | ⏳ |
| QA-L11 | Low | Portal → Materials (student) | Student yalnız READY materialları görür, siyahı da avtomatik yenilənmir. Konvertasiya bitəndən sonra material yalnız reload-dan sonra görünür. E2E-də bu, flaky test kimi üzə çıxdı. | ✅ Test düzəldildi (READY gözlənilir). ⏳ UX: təsdiq gözləyir |
| QA-B01 | — | W4 External APIs | `/external/*` proxy və portal səhifəsi hələ yoxdur (W4 API seçimi təsdiq gözləyir). SSRF testləri və "External APIs" axını tətbiq olunmur. | ⛔ W4-dən asılıdır |

## Yoxlanmış və qorunan (problem tapılmadı)

- **Auth bypass:**
  - `alg=none` və başqa secret ilə imzalanmış ADMIN token 401 alır.
  - Refresh token access kimi, access token isə refresh kimi işləmir.
  - Vaxtı keçmiş token 401 alır.
  - Refresh rotation və reuse detection işləyir.
- **Rollar:** ADMIN endpoint-lərinin hamısı (contract-da avtomatik) student ilə 403 qaytarır.
- **IDOR:**
  - Başqasının hesabı, əməliyyatları, kartı (GET/block/unblock), otel və uçuş bronu (GET/PATCH/DELETE), transferi, playlist-i (GET + track əlavə) 403 qaytarır.
  - İrəliləyiş yalnız özünündür: `userId` parametri 422 alır.
  - `/_history?all=true` student üçün 403 qaytarır.
- **SQL injection:**
  - `_db/query` aşağıdakıları rədd edir: çoxlu statement (boşluqsuz, şərhli, unicode boşluqlu), `VACUUM INTO`, `REPLACE`, CTE+DELETE, `readfile`, PRAGMA/ATTACH/`load_extension` (mövcud testlər).
  - Sirr sütunları sızmır.
  - Adi endpoint-lər parametrləşdirilib.
- **Path traversal:**
  - Encoded `../` ilə `.env`, `package.json`, `.git`, DB faylı açılmır.
  - Bir materialın imzası başqa materiala köçürülə bilmir.
- **XSS və header injection:**
  - OAuth consent HTML `state` və `scope` dəyərlərini escape edir.
  - Saxlanmış payload `application/json` + `nosniff` ilə qayıdır.
  - Fayl adındakı CRLF `Content-Disposition` başlığına düşmür.
  - Portalda `dangerouslySetInnerHTML` yoxdur.
- **CSP:** `script-src 'self'` (`unsafe-inline`/`eval` yoxdur), `object-src 'none'`, `frame-ancestors 'self'`, `X-Powered-By` yoxdur.
- **Mass assignment və prototype pollution:** sorğular 422 alır.
- **Concurrency:** eyni Idempotency-Key ilə 3 paralel transferdən yalnız 1 köçürmə yaranır, qalanları replay olur.
- **Portal matrisi:** 144 görünüşün heç birində overflow, uğursuz API sorğusu və ya JS xətası yoxdur (QA-H01 düzəldildikdən sonra).
