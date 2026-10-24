// External APIs (RapidAPI) endpoint-ləri: kataloq + hər icazəli endpoint üçün proxy handler (operationId kataloqdan).
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import type { ExternalApi } from './catalog.js';
import { isAdminRole } from '../../types.js';
import { ExternalProxy } from './proxy.js';

// Kataloq cavabı — açar heç vaxt daxil edilmir; yalnız "server key bu API üçün mövcuddurmu" bayrağı
function toView(api: ExternalApi, serverKeyAvailable: boolean) {
  return {
    id: api.id,
    name: api.name,
    host: api.host,
    rapidApiUrl: api.rapidApiUrl,
    description: api.description,
    freeLimit: api.freeLimit,
    hardLimit: api.hardLimit,
    verified: api.verified,
    serverKeyAvailable: serverKeyAvailable && api.hardLimit,
    endpoints: api.endpoints.map((e) => ({
      operationId: e.operationId,
      method: e.method,
      path: `/external/${api.id}${e.upstream === '/' ? '' : e.upstream}`,
      produces: e.produces,
      summary: e.summary,
      example: e.example,
    })),
  };
}

export function externalHandlers({ config }: AppContext): Handlers {
  const proxy = new ExternalProxy(config);
  const handlers: Handlers = {
    externalCatalog: (req, res) => {
      const admin = isAdminRole(req.auth?.role);
      const serverKeyAvailable = config.external.serverKeyEnabled && Boolean(config.external.serverKey) && Boolean(req.auth);
      res.json({
        items: proxy.visibleApis(admin).map((api) => toView(api, serverKeyAvailable)),
        serverKeyEnabled: config.external.serverKeyEnabled,
        ...(admin ? { unverified: config.external.catalog.filter((a) => !a.verified).map((a) => a.id) } : {}),
      });
    },
  };
  for (const api of config.external.catalog) {
    for (const endpoint of api.endpoints) handlers[endpoint.operationId] = (req, res) => proxy.forward(endpoint.operationId, req, res);
  }
  return handlers;
}
