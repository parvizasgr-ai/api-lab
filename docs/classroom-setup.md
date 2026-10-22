# Sinif üçün quraşdırma

API Lab-ı dərsdə iki yolla istifadə etmək olar:

- **A. Hər tələbə öz kompüterində.** Ən sadə və ən təhlükəsiz yoldur. Hər kəsin öz DB-si var, `_reset` başqasına təsir etmir.
- **B. Müəllimin kompüteri bütün sinfə xidmət edir (LAN).** Quraşdırma bir dəfə olur, tələbələr yalnız brauzer, Postman və ya curl istifadə edir. Bütün sinif bir DB-ni paylaşır.

Qısa yoxlama: `npm run classroom:check` (cari vəziyyət) və ya `npm run classroom:check -- --lan` (LAN-a hazırlıq). Skript heç nəyi dəyişmir.

---

## A. Hər tələbə öz kompüterində

Tələbədən tələb olunanlar: Node.js 20+ və Git. Slayd önizləməsi lazımdırsa, `poppler` də.

```bash
git clone <repo-url> api-lab && cd api-lab
npm install
cd web-design && corepack pnpm install && corepack pnpm build && cd ..
npm start                     # http://localhost:3000
```

- Server default olaraq yalnız tələbənin öz kompüterində açılır (`HOST=localhost` — 127.0.0.1 və ::1). Demo parollar (`student123`, `admin123`) burada təhlükəsizdir.
- External APIs üçün hər tələbə öz RapidAPI açarını portalda yazır (README → "External APIs").

## B. Müəllimin kompüteri — LAN rejimi

### 1. Hazırlıq (dərsdən əvvəl, ~10 dəq)

```bash
npm run classroom:check -- --lan
```

Skript bu kompüterin IP ünvanını tapır, nəyin çatışmadığını göstərir və **hazır `.env` bloku** çap edir. Blokda təsadüfi `JWT_SECRET` və `ADMIN_PASSWORD` olur. Bloku `.env` faylına köçürün:

```env
HOST=0.0.0.0
PUBLIC_URL=http://192.168.1.10:3000
JWT_SECRET=<təsadüfi, 48+ simvol>
ADMIN_PASSWORD=<təsadüfi>
TRUSTED_PROXIES=none
CORS_ORIGINS=
```

`ADMIN_PASSWORD`-u yadda saxlayın, çünki admin girişi artıq onunladır. Tələbələrə bu parolu verməyin.

Sonra yenidən yoxlayın və serveri işə salın:

```bash
npm run classroom:check -- --lan   # "Hazırdır." görünməlidir
npm start                          # "dinləyir: 0.0.0.0:3000 — şəbəkəyə açıq"
```

### 2. Niyə bu parametrlər məcburidir

Server şəbəkəyə açıqdırsa (`HOST` loopback deyilsə) və aşağıdakılardan biri ödənmirsə, **işə düşmür**:

| Parametr | Olmasa nə olar |
|---|---|
| `JWT_SECRET` (default olmayan, 32+ simvol) | Default dəyər repo-da açıqdır. Şəbəkədəki istənilən şəxs özünə ADMIN token düzəldib DB-ni sıfırlaya bilər |
| `ADMIN_PASSWORD` (10+ simvol, demo parol deyil) | `admin/admin123` README-də yazılıb, tələbə admin kimi daxil olub materialları silə bilər. Parol hər başlanğıcda və `/_reset`-dən sonra yenidən tətbiq olunur |
| `PUBLIC_URL` = LAN IP | Bunlar `localhost`-da işləmir. OAuth ("Google ilə daxil ol", Swagger Authorize) yalnız bu ünvanın callback-lərini avtomatik qəbul edir |
| `TRUSTED_PROXIES=none` | Arada nginx yoxdursa, `X-Forwarded-For` başlığına etibar edilməməlidir |

Tələbə hesabları (`student/student123`, `rauf/rauf123`) dərs üçün açıq qalır.

### 3. Tələbə cihazından yoxlama

Tələbənin noutbukunda brauzerdə `http://192.168.1.10:3000/api/v1/health` açın. Cavab `{"status":"ok"}` olmalıdır, sonra portal da açılmalıdır (`http://192.168.1.10:3000`).

Açılmırsa:

- **macOS firewall.** İlk başlanğıcda "node gələn bağlantıları qəbul etsin?" sualı çıxır, **Allow** seçin. Sonradan yoxlamaq üçün: System Settings → Network → Firewall.
- **Korporativ (idarə olunan) Mac və ya VPN.** Firewall siyasəti gələn bağlantıları bloklaya bilər. VPN aktivdirsə, `classroom:check` VPN ünvanını göstərə bilər (məs. `10.x`). Sinfin Wi-Fi şəbəkəsindəki ünvanı seçin (System Settings → Wi-Fi → Details → IP address) və ya VPN-i söndürün.
- **"Guest" Wi-Fi.** Bəzi şəbəkələr cihazların bir-birini görməsini qadağan edir (client isolation). Belə şəbəkədə A variantından istifadə edin.
- **IP dəyişib.** Wi-Fi dəyişəndə IP də dəyişir: `PUBLIC_URL`-u yeniləyin və serveri yenidən işə salın.

### 4. Dərs zamanı

- **Limitlər istifadəçi başınadır:** 60 sorğu/dəq (SQL Playground 20/dəq). Hər tələbə öz hesabı və ya tokeni ilə işləsə, bir-birinin limitinə təsir etmir. Eyni demo hesabı paylaşan tələbələr eyni limiti bölüşür.
- **Login kilidi:** eyni istifadəçi adına 5 dəqiqədə 10 səhv parol yazılarsa, həmin hesab cari 5 dəqiqəlik pəncərə bitənə qədər (ən çox 5 dəq) kilidlənir. Bu digər hesablara təsir etmir.
- **Sıfırlama:** admin kimi `POST /api/v1/_reset` (və ya Swagger) DB-ni seed vəziyyətinə qaytarır. Bu **bütün sinfin** datasına təsir edir, ona görə yalnız dərsin əvvəlində və ya sonunda istifadə edin.
- **External APIs:** hər tələbə öz RapidAPI açarı ilə işləyir. Server açarı (`EXTERNAL_SERVER_KEY_ENABLED=true`) bütün sinif üçün **sizin** kvotanızı xərcləyir. Onu yalnız Hard Limit-li API-lər üçün ehtiyat kimi açın.

### 5. Dərsdən sonra

`.env`-də `HOST=localhost` qoyun (və ya sətri silin) və serveri yenidən başladın. Server yenə yalnız sizin kompüterinizdə açılacaq.

---

## Etmədiklərimiz (lazım olsa)

- **İnternetə açmaq (HTTPS, domen).** Bunun üçün nginx və ya Caddy + TLS lazımdır, bu bələdçinin mövzusu deyil. Belə halda `TRUSTED_PROXIES=loopback` (proxy eyni maşındadırsa), `PUBLIC_URL=https://...` qoyun və `CORS_ORIGINS`-i dəqiq yazın.
- **Hər tələbəyə ayrıca hesab.** Seed-də 3 demo istifadəçi var. Çox hesab lazımdırsa, `db/seed/01_auth.sql`-ə əlavə etmək olar.
