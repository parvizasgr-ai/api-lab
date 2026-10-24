// Müştərilər endpoint-ləri. HTTP konsepsiyaları:
//   * Content negotiation: Accept: application/xml → XML, application/json (default) → JSON
//   * ETag + If-None-Match → 304 Not Modified (bandwidth qənaəti, conditional request)
//   * v1 köhnəlib: Deprecation + Sunset + Link (successor-version) başlıqları
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { toXml } from '../../lib/xml.js';
import { CustomersService, toCustomer, toCustomerV2 } from './service.js';
import type { CustomerRow } from './repo.js';

// v1-in söndürülmə planı (RFC 9745 Deprecation, RFC 8594 Sunset)
const DEPRECATED_AT = Date.UTC(2026, 8, 1) / 1000; // 2026-09-01
const SUNSET = new Date(Date.UTC(2026, 11, 31, 23, 59, 59)).toUTCString();

function deprecationHeaders(res: Response, successor: string) {
  res.set({ Deprecation: `@${DEPRECATED_AT}`, Sunset: SUNSET, Link: `<${successor}>; rel="successor-version"` });
}

const wantsXml = (req: Request) => req.accepts(['application/json', 'application/xml']) === 'application/xml';

function send(req: Request, res: Response, body: unknown, xml: { root: string; item?: string }) {
  if (wantsXml(req)) res.type('application/xml').send(toXml(xml.root, body, xml.item));
  else res.json(body);
}

// ETag məzmundan hesablanır: data dəyişəndə ETag da dəyişir. Format (JSON/XML) da daxildir.
const etagOf = (c: CustomerRow, format: string) =>
  `"${crypto.createHash('sha256').update(format + JSON.stringify(c)).digest('hex').slice(0, 16)}"`;

function matches(ifNoneMatch: string | undefined, etag: string) {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').map((s) => s.trim().replace(/^W\//, '')).some((t) => t === etag || t === '*');
}

export function customersHandlers({ db, config }: AppContext): Handlers {
  const customers = new CustomersService(db, config);

  return {
    listCustomers: async (req, res) => {
      deprecationHeaders(res, '/api/v2/customers');
      const page = await customers.list(req.valid.query as any);
      send(req, res, { ...page, items: page.items.map(toCustomer) }, { root: 'customerPage', item: 'customer' });
    },

    createCustomer: async (req, res) => {
      deprecationHeaders(res, '/api/v2/customers');
      const c = await customers.create(req.valid.body);
      res.status(201).location(`/api/v1/customers/${c.id}`).set('ETag', etagOf(c, 'json')).json(toCustomer(c));
    },

    getCustomer: async (req, res) => {
      deprecationHeaders(res, `/api/v2/customers/${req.valid.params.customerId}`);
      const c = await customers.get(req.valid.params.customerId);
      const etag = etagOf(c, wantsXml(req) ? 'xml' : 'json');
      res.set('ETag', etag);
      if (matches(req.get('if-none-match'), etag)) return res.status(304).end();
      send(req, res, toCustomer(c), { root: 'customer' });
    },

    headCustomer: async (req, res) => {
      const c = await customers.get(req.valid.params.customerId); // yoxdursa 404 (HEAD-də gövdə avtomatik göndərilmir)
      res.set('ETag', etagOf(c, 'json')).status(200).end();
    },

    replaceCustomer: async (req, res) => {
      deprecationHeaders(res, `/api/v2/customers/${req.valid.params.customerId}`);
      const c = await customers.replace(req.valid.params.customerId, req.valid.body);
      res.set('ETag', etagOf(c, 'json')).json(toCustomer(c));
    },

    patchCustomer: async (req, res) => {
      deprecationHeaders(res, `/api/v2/customers/${req.valid.params.customerId}`);
      const c = await customers.patch(req.valid.params.customerId, req.valid.body);
      res.set('ETag', etagOf(c, 'json')).json(toCustomer(c));
    },

    deleteCustomer: async (req, res) => {
      deprecationHeaders(res, '/api/v2/customers');
      await customers.delete(req.valid.params.customerId);
      res.status(204).end();
    },

    listCustomersV2: async (req, res) => {
      const page = await customers.list(req.valid.query as any);
      res.json({ ...page, items: page.items.map(toCustomerV2) });
    },

    getCustomerV2: async (req, res) => {
      res.json(toCustomerV2(await customers.get(req.valid.params.customerId)));
    },
  };
}
