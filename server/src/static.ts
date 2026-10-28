// Statik səhifələr: /docs (Swagger UI) və portal (web/dist). web/dist yoxdursa — sadə başlanğıc səhifəsi.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import express, { type Express } from 'express';
import type { Config } from './config.js';
const SWAGGER_UI_DIR = path.dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));

// Swagger UI bizim spec-i açsın və "Authorize" düyməsi mock Google OAuth ilə işləsin.
const SWAGGER_INIT = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/api/openapi.json',
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
    deepLinking: true,
    persistAuthorization: true,
    displayRequestDuration: true,
    oauth2RedirectUrl: window.location.origin + '/docs/oauth2-redirect.html',
  });
  window.ui.initOAuth({ clientId: 'apilab-portal', clientSecret: 'apilab-portal-secret', scopes: 'openid profile email' });
};
`;

const PLACEHOLDER = `<!doctype html>
<html lang="az">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Callbox</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 32px 16px; color: #1f2933; background: #fafafa; }
  h1 { margin-bottom: 4px; } p.sub { color: #52606d; margin-top: 0; }
  ul { padding-left: 20px; } li { margin: 8px 0; } a { color: #0b69a3; }
  code { background: #eef1f4; padding: 2px 6px; border-radius: 4px; }
  .note { background: #fff8e1; border: 1px solid #f0d58c; padding: 12px 16px; border-radius: 6px; }
</style>
</head>
<body>
  <h1>Callbox</h1>
  <p class="sub">Tələbələr üçün API təlim platforması — server işləyir.</p>
  <ul>
    <li><a href="/docs">Swagger UI — /docs</a> (bütün endpoint-lər, "Try it out")</li>
    <li><a href="/api/openapi.json">OpenAPI spec — /api/openapi.json</a></li>
    <li><a href="/api/postman/collection.json">Postman collection</a> və <a href="/api/postman/environment.json">environment</a></li>
    <li><a href="/api/v1/health">Health — /api/v1/health</a></li>
  </ul>
  <p>Demo istifadəçilər: <code>student / student123</code>, <code>rauf / rauf123</code>, <code>admin / admin123</code>. API Key: <code>apilab-demo-key-2026</code></p>
  <p class="note">Portal (React) hələ quraşdırılmayıb: <code>web/dist</code> qovluğu boşdur. Portal build olunduqdan sonra bu səhifənin yerində açılacaq.</p>
</body>
</html>`;

export function mountStatic(app: Express, config: Config): void {
  app.get('/docs/swagger-initializer.js', (_req, res) => {
    res.type('application/javascript').send(SWAGGER_INIT);
  });
  app.get('/docs', (req, res, next) => (req.path === '/docs' ? res.redirect(301, '/docs/') : next()));
  app.use('/docs', express.static(SWAGGER_UI_DIR, { index: 'index.html' }));

  // Portal (web-design build → web/dist). Hər sorğuda yoxlanılır: build-dən sonra serveri restart etmək lazım deyil.
  const portalIndex = path.join(config.webDist, 'index.html');
  app.use(express.static(config.webDist, { index: false }));

  // SPA fallback: API olmayan GET sorğuları portalın index.html-inə (/signin və s. client tərəfdə idarə olunur)
  app.get(/^\/(?!api\/|oauth\/|bff\/|docs\/|external\/|external$).*/, (req, res, next) => {
    if (!req.accepts('html')) return next();
    if (fs.existsSync(portalIndex)) return res.sendFile(portalIndex);
    res.type('html').send(PLACEHOLDER);
  });
}
