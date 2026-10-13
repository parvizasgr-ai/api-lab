# web/ — React portal üçün yer

Portalın UI-ı ayrıca hazırlanır. Build nəticəsi `web/dist/` qovluğuna qoyulanda (`web/dist/index.html`)
server onu avtomatik verir: `/` və API olmayan bütün yollar → `index.html` (SPA fallback),
`/api`, `/oauth`, `/bff`, `/docs` isə serverdə qalır. `web/dist` yoxdursa — başlanğıc səhifəsi göstərilir.

Portalın istifadə edəcəyi əsas endpoint-lər: `/bff/*` (ekranlar üçün aqreqasiya), `/api/v1/_history` (Explorer History),
`/api/v1/_db/*` (SQL Playground), `/api/openapi.json` (Explorer endpoint siyahısı), `/oauth/*` (Google ilə daxil ol).
