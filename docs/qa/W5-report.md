# W5 — Avtomatik QA hesabatı

> **W5.1 yeniləməsi (2026-10-13):** bütün Medium (M01–M10) və Low (L01–L11) maddələri düzəldildi, hər biri üçün regresiya testi var. Yalnız QA-B01 (W4) qalır.

Tarix: 2026-10-13 · Əhatə: backend API, təhlükəsizlik, portal (e2e + a11y matrisi) · Əmr: `npm run test:all`

## Nəticə (W5.1 — son qaçış)

| Qat | Keçdi | Skip | Qeyd |
|---|---|---|---|
| Backend (vitest; contract + security + qa-fixes daxil) | 534 | 3 | skip: 2 multipart happy path (materials.test.ts-də real fayllarla yoxlanır), 1 PPTX (soffice yoxdur) |
| — contract (`tests/contract.test.ts`) | 257 | 2 | 90 əməliyyatın hamısı avtomatik |
| — security (`tests/security.test.ts`) | 42 | 0 | |
| — QA düzəlişləri (`tests/qa-fixes.test.ts`) | 13 | 0 | M04 fallback, M10, L05–L09 |
| Portal unit (vitest + happy-dom) | 46 | 0 | `routes.test.ts` daxil |
| E2E (Playwright, Chrome) | 42 | 0 | `fixme` qalmayıb; matris 144 görünüş — axe istisnasız |

**Coverage**

| | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Backend (`server/src`) | 94.07% | 85.88% | 97.63% | 96.65% |
| Portal unit (`src/lib`, `src/api`) | 80.28% | 78.79% | 62.60% | 82.30% |

Portal UI komponentləri (`App.tsx`) unit coverage-ə daxil deyil — onlar e2e axınları və matrislə yoxlanır.

**Qeyd (mühit):** macOS-da uzun e2e zamanı sistem yuxuya gedərsə testlər asılı qalır (timeout). `pmset` logu ilə təsdiqləndi — kod problemi deyil. macOS-da `caffeinate -i npm run test:all` istifadə edin.

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
| QA-M01 | Medium | Portal, a11y | WCAG AA kontrast pozuntuları: Explorer `.environment-chip code` və mobil tab-lar; Home `.account-count`, `.table-avatar`; Auth Lab `.sequence-step` (light) və submit düymələri (dark); SQL `strong/small` (dark), `.sql-panel-head code` (light); Materials `small`, bölmə başlıqları, aktiv dərs filteri. | ✅ Düzəldildi (W5.1): minimal token düzəlişləri — light `--accent-blue` #006ce4→#0063d1, `--success` #008234→#00742e, `--danger` #d4111e→#cf111d; dark `--accent-blue` #4c8dff→#5593ff (mətn), primary fonda tünd mətn `--on-primary` (fon rəngi eyni qalır), dark `--warning-text`; OAuth diaqramında passiv addım opacity 0.43→0.86, kurs irəliləyişi mətni 0.58→0.72. Regresiya: matris (144 görünüş, axe — istisnasız) |
| QA-M02 | Medium | Portal, a11y | Mobil endə Home dərs kartlarındakı ox linklərinin (`.lesson-footer a`) və footer brend linkinin əlçatan adı yoxdur. | ✅ Düzəldildi: dərs kartı linkinə və footer brendinə `aria-label`. Regresiya: matris (axe link-name) |
| QA-M03 | Medium | Portal, a11y | `<html lang>` həmişə `az` qalır. EN rejimində ekran oxuyucusu mətni Azərbaycan dili kimi oxuyur (WCAG 3.1.1). | ✅ Düzəldildi: `document.documentElement.lang` dilə uyğun. Regresiya: matris + `qa-fixes.spec.ts` |
| QA-M04 | Medium | Portal | URL routing yoxdur: nav linkləri `#explorer` göstərir, amma reload və ya paylaşılan link həmişə Home-u açır. | ✅ Düzəldildi: History API routing (`/explorer`, `/apps/bank`, `/materials?lesson=2` …), Geri/İrəli, sessiyasız qorunan link → `/signin` → girişdən sonra həmin səhifə; server SPA fallback. Regresiya: `routes.test.ts`, `qa-fixes.test.ts` (fallback), `qa-fixes.spec.ts`, bütün e2e naviqasiyası URL-i yoxlayır |
| QA-M05 | Medium | Portal → Bank | "Kartı blokla" modalı Escape ilə bağlanmır. | ✅ Düzəldildi: ortaq `ModalBackdrop` — 7 modalın hamısı Escape ilə bağlanır, fokus dialoqa keçir və geri qayıdır. Regresiya: `flows.spec.ts` |
| QA-M06 | Medium | Portal → Müştərilər | Siyahı yüklənməyəndə xəta əvəzinə boş cədvəl görünür. Silmə xətası da göstərilmir (`finally` udur). | ✅ Düzəldildi: `LoadError` (kod + mesaj + "Yenidən cəhd et"); silmə xətası modalda göstərilir. Regresiya: `flows.spec.ts`, `qa-fixes.spec.ts` |
| QA-M07 | Medium | Portal → SQL | Schema yüklənməyəndə xəta göstərilmir ("Cədvəllər 0"). | ✅ Düzəldildi: schema xətası göstərilir. Regresiya: `flows.spec.ts` |
| QA-M08 | Medium | Portal → Valyuta | Məzənnə yüklənməyəndə "1 AZN = 0.0000 USD · İndicə yeniləndi" göstərilir. Yanlış məlumatdır, xəta yoxdur. | ✅ Düzəldildi: xəta halında `LoadError`, rəqəmlər əvəzinə "—". Regresiya: `flows.spec.ts` |
| QA-M10 | Medium | API rate limit | `trust proxy = loopback`: eyni maşından (loopback) gələn klient `X-Forwarded-For` dəyişdirərək anonim rate limit-dən qaça bilir. Uzaq klientlərə təsir etmir. | ✅ Düzəldildi: `trust proxy` yalnız `TRUSTED_PROXIES` env-dən (vergüllə: loopback/IP/CIDR; default `loopback`; `none` → heç biri). Qeyd: default loopback-da eyni maşındakı proses hələ də XFF göndərə bilər — server birbaşa açıqdırsa `TRUSTED_PROXIES=none`. Regresiya: `qa-fixes.test.ts` |
| QA-L01 | Low | Portal, a11y | Mobil endə `.table-scroll` klaviatura ilə scroll olunmur (`tabindex` yoxdur). | ✅ Düzəldildi: scroll olunan cədvəllər `role="region"` + `tabIndex=0` + görünən fokus. Regresiya: matris (axe) |
| QA-L02 | Low | Portal | Dil seçimi yadda qalmır: reload-dan sonra yenə AZ açılır (tema isə yadda qalır). | ✅ Düzəldildi: dil `localStorage`-da. Regresiya: `qa-fixes.spec.ts` |
| QA-L03 | Low | Portal → Materials | Dərs filteri yadda qalmır (W3-dən məlum). | ✅ Düzəldildi: filter URL-də (`?lesson=2`, paylaşıla bilər) və `localStorage`-da. Regresiya: `qa-fixes.spec.ts` |
| QA-L04 | Low | Portal footer | "© 2025 API Lab" yazılıb, il köhnədir. | ✅ Düzəldildi: il dinamikdir. Regresiya: `qa-fixes.spec.ts` |
| QA-L05 | Low | Auth | Login üçün hesab üzrə kilidləmə yoxdur, yalnız ümumi 60/dəq IP limiti var. Seed parolları onsuz da açıqdır, ona görə tədris mühitində qəbul olunandır. | ✅ Düzəldildi: username üzrə kilid — 5 dəq-də `LOGIN_MAX_FAILURES` (10) uğursuz cəhd → 429 + Retry-After (düzgün parol da), uğurlu giriş sıfırlayır; sayğac `rate_limit_counters`-də (`login-fail:<username>`). Regresiya: `qa-fixes.test.ts` |
| QA-L06 | Low | API logging | Material pre-signed URL-lərinin `exp&sig` hissəsi `request_log.path`-də saxlanılır. TTL bitənə qədər SQL Playground / `/_history` vasitəsilə görünür. | ✅ Yanlış pozitiv: `request_log.path` query-siz yazılır (`exp`/`sig` saxlanmır) — test ilə təsdiqləndi. Regresiya: `qa-fixes.test.ts` |
| QA-L07 | Low | API CORS | CORS istənilən origin-i əks etdirir, amma `credentials` yoxdur (token başlıqdadır). Lokal lab üçün qəsdən belədir. | ✅ Düzəldildi: CORS allowlist — default yalnız localhost/127.0.0.1 (istənilən port) + `PUBLIC_URL`; `CORS_ORIGINS` (vergüllə, `*` — hamısı). Regresiya: `qa-fixes.test.ts` |
| QA-L08 | Low | Auth | Logout-dan sonra access token ≤15 dəq etibarlı qalır (stateless JWT). Refresh token isə dərhal ləğv olunur. | ✅ Düzəldildi: access token-də `jti`; logout onu `revoked_access_tokens` denylist-inə yazır (exp-ə qədər; migration 005). Regresiya: `qa-fixes.test.ts` |
| QA-L09 | Low | API Customers | PATCH `{"phone": null}` telefonu silə bilmir (sxem null qəbul etmir). | ✅ Düzəldildi: `CustomerPatch.phone/city` nullable, `null` dəyəri silir. Regresiya: `qa-fixes.test.ts` |
| QA-L10 | Low | Portal → Müştərilər | Yalnız ilk 20 müştəri göstərilir, pagination UI yoxdur. | ✅ Düzəldildi: səhifələmə (Əvvəlki / Növbəti, `page / totalPages · total`). Regresiya: `qa-fixes.spec.ts` |
| QA-L11 | Low | Portal → Materials (student) | Student yalnız READY materialları görür, siyahı da avtomatik yenilənmir. Konvertasiya bitəndən sonra material yalnız reload-dan sonra görünür. E2E-də bu, flaky test kimi üzə çıxdı. | ✅ Düzəldildi: siyahı hər 30 san və vərəqəyə qayıdanda yenilənir (flaky test də düzəldilib). Regresiya: `qa-fixes.spec.ts` |
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
