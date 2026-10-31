// SQL dərsliyi (W3Schools üslubu): hər dərs — izah, sintaksis, "Özün sına" nümunələri və avtomatik yoxlanan tapşırıq.
// Bütün nümunələr Callbox-un real (PostgreSQL) cədvəllərində işləyir; tests: sql/lessons.test.ts hər SQL-in
// sintaksisinin və yalnız oxuma qaydasının pozulmadığını yoxlayır, e2e isə nümunələri real bazada icra edir.

export type Example = { title: string; text?: string; sql: string };
export type Exercise = {
  task: string;
  solution: string;
  ordered?: boolean; // true — sətirlərin sırası da yoxlanılır (ORDER BY dərsləri)
  hint: string;
  starter?: string;
};
export type Lesson = {
  id: string;
  title: string;
  group: "Əsaslar" | "Süzgəc" | "Qruplaşdırma" | "Alət";
  body: string; // Markdown
  syntax?: string;
  examples: Example[];
  exercise?: Exercise;
};

export const LESSONS: Lesson[] = [
  {
    id: "intro",
    title: "SQL nədir?",
    group: "Əsaslar",
    body: `**SQL** (Structured Query Language) — verilənlər bazası ilə danışmaq üçün standart dildir. Biznes analitik üçün SQL ən vacib bacarıqlardan biridir: hesabat, tələb yoxlaması, data keyfiyyəti — hamısı SQL ilə edilir.

Bu dərslikdə **Callbox-un real PostgreSQL bazası** üzərində işləyirik: API-də etdiyiniz hər əməliyyat (kart bloklama, bron, köçürmə) burada sətir kimi görünür. Sağdakı **Verilənlər bazası** panelində bütün cədvəllər və sətir sayları var.

### Bu səhifədə nə edə bilərsiniz
| İcazə var | İcazə yoxdur |
|---|---|
| \`SELECT\`, \`WHERE\`, \`ORDER BY\`, \`GROUP BY\`, \`HAVING\`, \`JOIN\`, \`DISTINCT\`, \`BETWEEN\`, \`LIKE\`, \`IN\`, \`CASE\`, \`WITH\`, alias (\`AS\`) | \`INSERT\`, \`UPDATE\`, \`DELETE\`, \`DROP\`, \`ALTER\`, \`CREATE\` — data dəyişmir (təhlükəsizlik) |

Hər dərsin sonunda **tapşırıq** var — sorğunu yazıb **Yoxla** düyməsini basın: server nəticəni gözlənilən cavabla müqayisə edir.`,
    examples: [{ title: "İlk sorğunuz", text: "Bütün valyutaları göstər:", sql: "SELECT * FROM currencies;" }],
  },
  {
    id: "select",
    title: "SELECT",
    group: "Əsaslar",
    body: `\`SELECT\` cədvəldən data seçir. Nəticə **result set** adlanan cədvəldir.

* \`*\` — bütün sütunlar. Real hesabatlarda yalnız lazım olan sütunları yazın: sorğu sürətli olur, nəticə oxunaqlı.
* Sütun adları vergüllə ayrılır.`,
    syntax: "SELECT sütun1, sütun2, ...\nFROM cədvəl_adı;\n\nSELECT * FROM cədvəl_adı;",
    examples: [
      { title: "Bir neçə sütun", text: "Kitabların adı və müəllifi:", sql: "SELECT title, author\nFROM books;" },
      { title: "Bütün sütunlar", text: "Hava limanlarının bütün sütunları:", sql: "SELECT * FROM airports;" },
    ],
    exercise: {
      task: "`hotels` cədvəlindən otellərin **adını** (`name`) və **şəhərini** (`city`) seçin.",
      solution: "SELECT name, city FROM hotels;",
      hint: "SELECT name, city FROM ...",
    },
  },
  {
    id: "distinct",
    title: "SELECT DISTINCT",
    group: "Əsaslar",
    body: `\`SELECT DISTINCT\` təkrarlanan dəyərləri atır — yalnız **fərqli** dəyərlər qalır.
Məsələn, 40 kitab var, amma janrlar daha azdır: hansı janrlar var?

\`COUNT(DISTINCT sütun)\` — neçə fərqli dəyər olduğunu sayır.`,
    syntax: "SELECT DISTINCT sütun1, sütun2, ...\nFROM cədvəl_adı;",
    examples: [
      { title: "Fərqli janrlar", sql: "SELECT DISTINCT genre\nFROM books;" },
      { title: "Neçə fərqli janr var?", sql: "SELECT COUNT(DISTINCT genre) AS janr_sayi\nFROM books;" },
    ],
    exercise: {
      task: "Otellərin yerləşdiyi **fərqli şəhərləri** (`city`) göstərin (`hotels` cədvəli).",
      solution: "SELECT DISTINCT city FROM hotels;",
      hint: "SELECT DISTINCT city FROM ...",
    },
  },
  {
    id: "where",
    title: "WHERE",
    group: "Süzgəc",
    body: `\`WHERE\` sətirləri **şərtə görə süzür** — yalnız şərti ödəyən sətirlər nəticəyə düşür.
Mətn dəyərləri tək dırnaqda yazılır (\`'Bakı'\`), rəqəmlər dırnaqsız (\`5\`).

| Operator | Mənası |
|---|---|
| \`=\` | bərabərdir |
| \`<>\` və ya \`!=\` | bərabər deyil |
| \`>\` \`<\` \`>=\` \`<=\` | böyük / kiçik |
| \`BETWEEN\` | aralıqda |
| \`LIKE\` | şablona uyğun |
| \`IN\` | siyahıdakı dəyərlərdən biri |`,
    syntax: "SELECT sütun1, sütun2, ...\nFROM cədvəl_adı\nWHERE şərt;",
    examples: [
      { title: "Mətnə görə", text: "Bakıdakı otellər:", sql: "SELECT name, stars, rating\nFROM hotels\nWHERE city = 'Bakı';" },
      { title: "Rəqəmə görə", text: "500 səhifədən qalın kitablar:", sql: "SELECT title, pages\nFROM books\nWHERE pages > 500;" },
    ],
    exercise: {
      task: "**5 ulduzlu** otellərin adını və şəhərini göstərin.",
      solution: "SELECT name, city FROM hotels WHERE stars = 5;",
      hint: "WHERE stars = ...",
    },
  },
  {
    id: "order-by",
    title: "ORDER BY (ASC, DESC)",
    group: "Süzgəc",
    body: `\`ORDER BY\` nəticəni sıralayır.

* \`ASC\` — artan sıra (A→Z, 1→9). **Default**-dur, yazmasanız da ASC olur.
* \`DESC\` — azalan sıra (Z→A, 9→1).
* Bir neçə sütun: əvvəl birinciyə, bərabər olanda ikinciyə görə sıralanır.

SQL-də sıra **zəmanətli deyil** — sıralı nəticə lazımdırsa, həmişə \`ORDER BY\` yazın.`,
    syntax: "SELECT sütun1, sütun2, ...\nFROM cədvəl_adı\nORDER BY sütun1 [ASC|DESC], sütun2 [ASC|DESC];",
    examples: [
      { title: "Azalan (DESC)", text: "Ən yüksək reytinqli kitablar yuxarıda:", sql: "SELECT title, rating\nFROM books\nORDER BY rating DESC;" },
      { title: "Bir neçə sütun", text: "Əvvəl şəhər A→Z, sonra eyni şəhərdə ulduz sayı çoxdan aza:", sql: "SELECT city, name, stars\nFROM hotels\nORDER BY city ASC, stars DESC;" },
    ],
    exercise: {
      task: "Kitabların adı (`title`) və səhifə sayını (`pages`) **səhifə sayı çoxdan aza** sıralayın.",
      solution: "SELECT title, pages FROM books ORDER BY pages DESC, title;",
      ordered: true,
      hint: "ORDER BY pages DESC (eyni səhifə sayında title ilə sıralayın)",
    },
  },
  {
    id: "and-or-not",
    title: "AND, OR, NOT",
    group: "Süzgəc",
    body: `Bir neçə şərti birləşdirmək üçün:

* \`AND\` — **hər iki** şərt doğru olmalıdır;
* \`OR\` — **ən azı biri** doğru olmalıdır;
* \`NOT\` — şərti tərsinə çevirir.

\`AND\` \`OR\`-dan əvvəl hesablanır — qarışıq şərtlərdə **mötərizə** yazın: \`WHERE a AND (b OR c)\`.`,
    syntax: "SELECT ... FROM cədvəl\nWHERE şərt1 AND (şərt2 OR şərt3)\n  AND NOT şərt4;",
    examples: [
      { title: "AND", text: "Bakıda olan və reytinqi 9-dan yüksək otellər:", sql: "SELECT name, rating\nFROM hotels\nWHERE city = 'Bakı' AND rating > 9;" },
      { title: "OR + mötərizə", text: "Poema və ya Roman janrında, 1900-dən sonra yazılmış kitablar:", sql: "SELECT title, genre, year\nFROM books\nWHERE (genre = 'Poema' OR genre = 'Roman')\n  AND year > 1900;" },
      { title: "NOT", text: "Bakıdan olmayan otellər:", sql: "SELECT name, city\nFROM hotels\nWHERE NOT city = 'Bakı';" },
    ],
    exercise: {
      task: "**GYD**-dən **LHR**-ə uçan **və** aktarması olmayan (`stops = 0`) reyslərin nömrəsini (`flight_no`) və uçuş vaxtını (`depart_at`) göstərin.",
      solution: "SELECT flight_no, depart_at FROM flights WHERE from_code = 'GYD' AND to_code = 'LHR' AND stops = 0;",
      hint: "WHERE from_code = 'GYD' AND to_code = 'LHR' AND stops = 0",
    },
  },
  {
    id: "between",
    title: "BETWEEN",
    group: "Süzgəc",
    body: `\`BETWEEN a AND b\` — dəyər **a ilə b arasındadır** (sərhədlər **daxil**). \`x BETWEEN 1 AND 5\` = \`x >= 1 AND x <= 5\`.
Rəqəmlər, tarixlər və mətnlər üçün işləyir. \`NOT BETWEEN\` — aralıqdan kənar.`,
    syntax: "SELECT ... FROM cədvəl\nWHERE sütun BETWEEN dəyər1 AND dəyər2;",
    examples: [
      { title: "Rəqəm aralığı", text: "300–400 səhifəlik kitablar:", sql: "SELECT title, pages\nFROM books\nWHERE pages BETWEEN 300 AND 400\nORDER BY pages;" },
      { title: "Tarix aralığı", text: "Bu ayın 1-dən 10-dək olan məzənnələr (USD):", sql: "SELECT rate_date, rate\nFROM exchange_rates\nWHERE quote = 'USD'\n  AND rate_date BETWEEN to_char(date_trunc('month', now()), 'YYYY-MM-DD')\n                    AND to_char(date_trunc('month', now()) + interval '9 days', 'YYYY-MM-DD')\nORDER BY rate_date;" },
    ],
    exercise: {
      task: "Reytinqi **9.0 ilə 9.5 arasında** (daxil) olan otellərin adını və reytinqini göstərin.",
      solution: "SELECT name, rating FROM hotels WHERE rating BETWEEN 9.0 AND 9.5;",
      hint: "WHERE rating BETWEEN 9.0 AND 9.5",
    },
  },
  {
    id: "in",
    title: "IN",
    group: "Süzgəc",
    body: `\`IN (...)\` — dəyər siyahıdakılardan **biridirsə** doğrudur. Bir neçə \`OR\`-un qısa yazılışıdır:
\`city IN ('Bakı', 'Qəbələ')\` = \`city = 'Bakı' OR city = 'Qəbələ'\`. \`NOT IN\` — heç biri deyil.`,
    syntax: "SELECT ... FROM cədvəl\nWHERE sütun IN (dəyər1, dəyər2, ...);",
    examples: [
      { title: "IN", text: "Türkiyə və Gürcüstandakı hava limanları:", sql: "SELECT code, city, country\nFROM airports\nWHERE country IN ('Türkiyə', 'Gürcüstan');" },
      { title: "NOT IN", text: "AZN, USD və EUR-dan başqa valyutalar:", sql: "SELECT code, name\nFROM currencies\nWHERE code NOT IN ('AZN', 'USD', 'EUR');" },
    ],
    exercise: {
      task: "Şəhəri **Bakı, Qəbələ və ya Gəncə** olan otellərin adı və şəhərini `IN` ilə göstərin.",
      solution: "SELECT name, city FROM hotels WHERE city IN ('Bakı', 'Qəbələ', 'Gəncə');",
      hint: "WHERE city IN ('Bakı', 'Qəbələ', 'Gəncə')",
    },
  },
  {
    id: "like",
    title: "LIKE (şablon)",
    group: "Süzgəc",
    body: `\`LIKE\` mətni **şablonla** axtarır:

| Simvol | Mənası | Nümunə |
|---|---|---|
| \`%\` | istənilən sayda simvol (0 və ya çox) | \`'Nizami%'\` — Nizami ilə başlayır |
| \`_\` | tam bir simvol | \`'J2 0__'\` — J2 0 + iki simvol |

PostgreSQL-də \`LIKE\` böyük-kiçik hərfə həssasdır; \`ILIKE\` — həssas deyil.`,
    syntax: "SELECT ... FROM cədvəl\nWHERE sütun LIKE 'şablon';",
    examples: [
      { title: "Başlayır", text: "Nizami Gəncəvinin kitabları:", sql: "SELECT title, author\nFROM books\nWHERE author LIKE 'Nizami%';" },
      { title: "Daxilində", text: "Adında \"Hotel\" olan otellər (hərf fərqi nəzərə alınmır):", sql: "SELECT name, city\nFROM hotels\nWHERE name ILIKE '%hotel%';" },
    ],
    exercise: {
      task: "Adı (`title`) **'S' hərfi ilə başlayan** kitabları göstərin (yalnız `title`).",
      solution: "SELECT title FROM books WHERE title LIKE 'S%';",
      hint: "WHERE title LIKE 'S%'",
    },
  },
  {
    id: "null",
    title: "NULL dəyərlər",
    group: "Süzgəc",
    body: `\`NULL\` — **dəyər yoxdur** (bilinmir). Bu 0 və ya boş mətn deyil.
\`= NULL\` **işləmir** (nəticə həmişə boşdur) — \`IS NULL\` / \`IS NOT NULL\` yazılır.
\`COALESCE(a, b)\` — a NULL-dursa b-ni qaytarır.`,
    syntax: "SELECT ... FROM cədvəl\nWHERE sütun IS NULL;\n\nSELECT COALESCE(sütun, 'əvəz') FROM cədvəl;",
    examples: [
      { title: "IS NULL", text: "Nəşr ili məlum olmayan kitablar:", sql: "SELECT title, author, year\nFROM books\nWHERE year IS NULL;" },
      { title: "COALESCE", text: "Blok səbəbi olmayan kartlarda \"—\" göstər:", sql: "SELECT id, status, COALESCE(status_reason, '—') AS sebeb\nFROM cards;" },
    ],
    exercise: {
      task: "**Bloklanma səbəbi** (`status_reason`) olan kartların `id`, `status` və `status_reason` sütunlarını göstərin.",
      solution: "SELECT id, status, status_reason FROM cards WHERE status_reason IS NOT NULL;",
      hint: "WHERE status_reason IS NOT NULL",
    },
  },
  {
    id: "limit",
    title: "LIMIT və OFFSET",
    group: "Süzgəc",
    body: `\`LIMIT n\` — nəticədən yalnız ilk **n** sətir. \`OFFSET k\` — ilk k sətri buraxır (səhifələmə: 2-ci səhifə = \`LIMIT 10 OFFSET 10\`).
"Top 5" hesabatı üçün \`ORDER BY\` + \`LIMIT\` birlikdə yazılır.

Fərqli bazalarda: SQL Server — \`SELECT TOP 5\`, Oracle / standart — \`FETCH FIRST 5 ROWS ONLY\`.`,
    syntax: "SELECT ... FROM cədvəl\nORDER BY sütun\nLIMIT n OFFSET k;",
    examples: [
      { title: "Top 5", text: "Ən ucuz 5 reys:", sql: "SELECT flight_no, from_code, to_code, price_minor / 100.0 AS qiymet\nFROM flights\nORDER BY price_minor\nLIMIT 5;" },
      { title: "Səhifələmə", text: "Kitablar, 2-ci səhifə (hər səhifədə 10):", sql: "SELECT id, title\nFROM books\nORDER BY id\nLIMIT 10 OFFSET 10;" },
    ],
    exercise: {
      task: "Ən **yüksək reytinqli 3 oteli** (adı və reytinqi) göstərin.",
      solution: "SELECT name, rating FROM hotels ORDER BY rating DESC, name LIMIT 3;",
      ordered: true,
      hint: "ORDER BY rating DESC LIMIT 3",
    },
  },
  {
    id: "aliases",
    title: "Alias (AS)",
    group: "Əsaslar",
    body: `**Alias** — sütuna və ya cədvələ müvəqqəti ad. Nəticəni oxunaqlı edir, hesablanmış sütunlara ad verir.

* Sütun: \`price_minor / 100.0 AS qiymet\`. Boşluqlu ad üçün qoşa dırnaq: \`AS "Gecəlik qiymət"\`.
* Cədvəl: \`FROM hotels h\` — sonra \`h.name\` yazılır (JOIN-larda çox lazımdır).`,
    syntax: "SELECT sütun AS alias_adi\nFROM cədvəl AS c;",
    examples: [
      { title: "Hesablanmış sütun", text: "Qiymət qəpikdə saxlanılır — manata çevirib ad veririk:", sql: "SELECT name AS otel,\n       price_per_night_minor / 100.0 AS \"Gecəlik qiymət\"\nFROM hotels;" },
      { title: "Cədvəl alias-ı", sql: "SELECT h.name, h.city\nFROM hotels AS h\nWHERE h.stars >= 4;" },
    ],
    exercise: {
      task: "Kitabların adını `kitab`, müəllifini `muellif` adı ilə göstərin.",
      solution: "SELECT title AS kitab, author AS muellif FROM books;",
      hint: "SELECT title AS kitab, ...",
    },
  },
  {
    id: "aggregate",
    title: "COUNT, SUM, AVG, MIN, MAX",
    group: "Qruplaşdırma",
    body: `**Aqreqat funksiyalar** çox sətirdən **bir** dəyər hesablayır:

| Funksiya | Nə edir |
|---|---|
| \`COUNT(*)\` | sətir sayı |
| \`SUM(x)\` | cəm |
| \`AVG(x)\` | orta |
| \`MIN(x)\` / \`MAX(x)\` | ən kiçik / ən böyük |

\`NULL\` dəyərlər nəzərə alınmır (\`COUNT(*)\` istisna). \`ROUND(x, 2)\` — yuvarlaqlaşdırma.`,
    syntax: "SELECT COUNT(*), AVG(sütun), MIN(sütun), MAX(sütun)\nFROM cədvəl\nWHERE şərt;",
    examples: [
      { title: "Bir neçə aqreqat", text: "Kitablar haqqında statistika:", sql: "SELECT COUNT(*) AS say,\n       ROUND(AVG(pages)) AS orta_sehife,\n       MIN(year) AS en_kohne,\n       MAX(rating) AS en_yuksek_reytinq\nFROM books;" },
      { title: "WHERE ilə", text: "student-in (owner_id = 1) hesablarının cəmi balansı (qəpikdən manata):", sql: "SELECT SUM(balance_minor) / 100.0 AS cem_balans\nFROM accounts\nWHERE owner_id = 1;" },
    ],
    exercise: {
      task: "Neçə **reys** (`flights`) var? Bir sütunlu nəticə qaytarın.",
      solution: "SELECT COUNT(*) FROM flights;",
      hint: "SELECT COUNT(*) FROM flights",
    },
  },
  {
    id: "group-by",
    title: "GROUP BY",
    group: "Qruplaşdırma",
    body: `\`GROUP BY\` eyni dəyərli sətirləri **qrupa** yığır və hər qrup üçün aqreqat hesablayır: "hər şəhərdə neçə otel?", "hər janrın orta reytinqi?".

**Qayda:** \`SELECT\`-də olan və aqreqat olmayan hər sütun \`GROUP BY\`-da da olmalıdır.`,
    syntax: "SELECT sütun, COUNT(*)\nFROM cədvəl\nGROUP BY sütun\nORDER BY COUNT(*) DESC;",
    examples: [
      { title: "Hər şəhərdə neçə otel", sql: "SELECT city, COUNT(*) AS otel_sayi\nFROM hotels\nGROUP BY city\nORDER BY otel_sayi DESC;" },
      { title: "Janr üzrə orta reytinq", sql: "SELECT genre, COUNT(*) AS kitab, ROUND(AVG(rating)::numeric, 2) AS orta_reytinq\nFROM books\nGROUP BY genre\nORDER BY orta_reytinq DESC;" },
    ],
    exercise: {
      task: "Hər **aviaşirkət** (`airline_name`) üzrə reys sayını göstərin (2 sütun: aviaşirkət və say).",
      solution: "SELECT airline_name, COUNT(*) FROM flights GROUP BY airline_name;",
      hint: "GROUP BY airline_name",
    },
  },
  {
    id: "having",
    title: "HAVING",
    group: "Qruplaşdırma",
    body: `\`HAVING\` — **qrupları** süzür (aqreqatdan sonra). \`WHERE\` isə **sətirləri** süzür (qruplaşdırmadan əvvəl).

| | WHERE | HAVING |
|---|---|---|
| Nə vaxt | GROUP BY-dan əvvəl | GROUP BY-dan sonra |
| Nəyi süzür | sətirləri | qrupları |
| Aqreqat (COUNT, AVG) | olmaz | olar |

İcra sırası: \`FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT\`.`,
    syntax: "SELECT sütun, COUNT(*)\nFROM cədvəl\nWHERE sətir_şərti\nGROUP BY sütun\nHAVING COUNT(*) > n;",
    examples: [
      { title: "HAVING", text: "2-dən çox oteli olan şəhərlər:", sql: "SELECT city, COUNT(*) AS otel_sayi\nFROM hotels\nGROUP BY city\nHAVING COUNT(*) > 2;" },
      { title: "WHERE + HAVING", text: "1900-dən sonrakı kitablarda, orta reytinqi 4.5-dən yuxarı olan janrlar:", sql: "SELECT genre, ROUND(AVG(rating)::numeric, 2) AS orta\nFROM books\nWHERE year > 1900\nGROUP BY genre\nHAVING AVG(rating) > 4.5;" },
    ],
    exercise: {
      task: "**5-dən çox** reysi olan istiqamətləri (`to_code`) və reys sayını göstərin.",
      solution: "SELECT to_code, COUNT(*) FROM flights GROUP BY to_code HAVING COUNT(*) > 5;",
      hint: "GROUP BY to_code HAVING COUNT(*) > 5",
    },
  },
];

export const EDITOR_ID = "editor";
