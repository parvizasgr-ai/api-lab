// External APIs (RapidAPI Hub) kataloqu — proxy-nin YEGANƏ allowlist-i (SSRF qoruması).
//   * Proxy yalnız buradakı host-lara, yalnız buradakı path pattern-lərinə və query parametrlərinə sorğu göndərir.
//   * verified:false — real RAPIDAPI_KEY ilə yoxlanmayıb: tələbələrə göstərilmir, proxy 404 qaytarır.
//     Yoxlamaq: `npm run external:verify` (bayrağı avtomatik DƏYİŞMİR — yalnız təklif edir).
//   * hardLimit:true — RapidAPI Basic planı limiti aşanda pul çıxmır (bloklayır). Server key (ehtiyat) YALNIZ bunlar üçündür.
// Endpoint-in proxy yolu = `/external/<api.id><upstream>` (məs. /external/geodb/v1/geo/cities).

export type Localized = { az: string; en: string };

export interface ExternalEndpoint {
  operationId: string; // openapi.yaml-dakı əməliyyat
  method: 'GET' | 'POST';
  upstream: string; // upstream path şablonu: /v1/geo/countries/{countryId}
  params?: Record<string, RegExp>; // path parametrlərinin icazəli forması (spec-də də pattern var)
  query: string[]; // upstream-ə ötürülən query parametrləri (qalanı spec-də 422)
  produces: 'json' | 'image';
  summary: Localized;
  example: { path: string; query?: Record<string, string>; body?: Record<string, unknown> }; // portal/Explorer handoff
}

export interface ExternalApi {
  id: string;
  name: string;
  host: string; // *.p.rapidapi.com
  rapidApiUrl: string; // abunə səhifəsi
  description: Localized;
  freeLimit: Localized;
  hardLimit: boolean;
  verified: boolean;
  endpoints: ExternalEndpoint[];
}

export const EXTERNAL_CATALOG: ExternalApi[] = [
  {
    id: 'jokes',
    name: 'JokeAPI',
    host: 'jokeapi-v2.p.rapidapi.com',
    rapidApiUrl: 'https://rapidapi.com/Sv443/api/jokeapi-v2',
    description: { az: 'Proqramçı zarafatları — ən sadə ilk GET sorğusu, path parametri ilə kateqoriya.', en: 'Programming jokes — the simplest first GET, category as a path parameter.' },
    freeLimit: { az: 'Pulsuz (~120 sorğu/dəq)', en: 'Free (~120 requests/min)' },
    hardLimit: false,
    verified: false,
    endpoints: [
      {
        operationId: 'externalJoke',
        method: 'GET',
        upstream: '/joke/{category}',
        params: { category: /^(Any|Programming|Misc|Pun|Spooky|Christmas)$/ },
        query: ['type', 'amount', 'lang'],
        produces: 'json',
        summary: { az: 'Təsadüfi zarafat', en: 'Random joke' },
        example: { path: '/external/jokes/joke/Programming', query: { type: 'single' } },
      },
    ],
  },
  {
    id: 'geodb',
    name: 'GeoDB Cities',
    host: 'wft-geo-db.p.rapidapi.com',
    rapidApiUrl: 'https://rapidapi.com/wirefreethought/api/geodb-cities',
    description: { az: 'Şəhərlər və ölkələr — pagination (offset/limit), filter və path parametri.', en: 'Cities and countries — pagination (offset/limit), filters and path parameters.' },
    freeLimit: { az: '1 000 sorğu/gün, 1 sorğu/san (Hard Limit)', en: '1,000 requests/day, 1 req/sec (Hard Limit)' },
    hardLimit: true,
    verified: false,
    endpoints: [
      {
        operationId: 'externalGeoCities',
        method: 'GET',
        upstream: '/v1/geo/cities',
        query: ['namePrefix', 'countryIds', 'minPopulation', 'limit', 'offset', 'sort'],
        produces: 'json',
        summary: { az: 'Şəhər axtarışı', en: 'Search cities' },
        example: { path: '/external/geodb/v1/geo/cities', query: { namePrefix: 'Bak', limit: '5' } },
      },
      {
        operationId: 'externalGeoCountry',
        method: 'GET',
        upstream: '/v1/geo/countries/{countryId}',
        params: { countryId: /^[A-Z]{2}$/ },
        query: [],
        produces: 'json',
        summary: { az: 'Ölkə haqqında', en: 'Country details' },
        example: { path: '/external/geodb/v1/geo/countries/AZ' },
      },
    ],
  },
  {
    id: 'weather',
    name: 'WeatherAPI.com',
    host: 'weatherapi-com.p.rapidapi.com',
    rapidApiUrl: 'https://rapidapi.com/weatherapi/api/weatherapi-com',
    description: { az: 'Cari hava və proqnoz — query parametrləri, iç-içə JSON.', en: 'Current weather and forecast — query parameters, nested JSON.' },
    freeLimit: { az: 'Pulsuz plan (limiti RapidAPI-də yoxlayın)', en: 'Free plan (check the limit on RapidAPI)' },
    hardLimit: false,
    verified: false,
    endpoints: [
      {
        operationId: 'externalWeatherCurrent',
        method: 'GET',
        upstream: '/current.json',
        query: ['q', 'lang'],
        produces: 'json',
        summary: { az: 'Cari hava', en: 'Current weather' },
        example: { path: '/external/weather/current.json', query: { q: 'Baku' } },
      },
      {
        operationId: 'externalWeatherForecast',
        method: 'GET',
        upstream: '/forecast.json',
        query: ['q', 'days', 'lang'],
        produces: 'json',
        summary: { az: 'Proqnoz (1–3 gün)', en: 'Forecast (1–3 days)' },
        example: { path: '/external/weather/forecast.json', query: { q: 'Baku', days: '3' } },
      },
    ],
  },
  {
    id: 'movies',
    name: 'OMDb (Movie Database Alternative)',
    host: 'movie-database-alternative.p.rapidapi.com',
    rapidApiUrl: 'https://rapidapi.com/rapidapi/api/movie-database-alternative',
    description: { az: 'Film axtarışı və detal — axtarış → ID → detal axını; xəta 200 + "Response":"False" ilə gəlir.', en: 'Movie search and details — search → ID → details; errors come as 200 + "Response":"False".' },
    freeLimit: { az: '1 000 sorğu/gün', en: '1,000 requests/day' },
    hardLimit: false,
    verified: false,
    endpoints: [
      {
        operationId: 'externalMovies',
        method: 'GET',
        upstream: '/',
        query: ['s', 'i', 't', 'type', 'y', 'page', 'r'],
        produces: 'json',
        summary: { az: 'Axtarış (s) və ya detal (i)', en: 'Search (s) or details (i)' },
        example: { path: '/external/movies', query: { s: 'Inception', r: 'json' } },
      },
    ],
  },
  {
    id: 'numbers',
    name: 'Numbers API',
    host: 'numbersapi.p.rapidapi.com',
    rapidApiUrl: 'https://rapidapi.com/divad12/api/numbers-1',
    description: { az: 'Rəqəmlər və tarixlər haqqında faktlar — path parametrləri, json=true.', en: 'Facts about numbers and dates — path parameters, json=true.' },
    freeLimit: { az: 'Pulsuz (limiti RapidAPI-də yoxlayın)', en: 'Free (check the limit on RapidAPI)' },
    hardLimit: false,
    verified: false,
    endpoints: [
      {
        operationId: 'externalNumberTrivia',
        method: 'GET',
        upstream: '/{number}/trivia',
        params: { number: /^(random|-?\d{1,9})$/ },
        query: ['json', 'fragment'],
        produces: 'json',
        summary: { az: 'Rəqəm faktı', en: 'Number trivia' },
        example: { path: '/external/numbers/42/trivia', query: { json: 'true', fragment: 'true' } },
      },
      {
        operationId: 'externalDateFact',
        method: 'GET',
        upstream: '/{month}/{day}/date',
        params: { month: /^(0?[1-9]|1[0-2])$/, day: /^(0?[1-9]|[12]\d|3[01])$/ },
        query: ['json', 'fragment'],
        produces: 'json',
        summary: { az: 'Tarix faktı', en: 'Date fact' },
        example: { path: '/external/numbers/5/28/date', query: { json: 'true' } },
      },
    ],
  },
  {
    id: 'translate',
    name: 'Deep Translate',
    host: 'deep-translate1.p.rapidapi.com',
    rapidApiUrl: 'https://rapidapi.com/gatzuma/api/deep-translate1',
    description: { az: 'Mətn tərcüməsi — siyahıda yeganə POST + JSON body.', en: 'Text translation — the only POST + JSON body in the list.' },
    freeLimit: { az: 'Simvol kvotası (RapidAPI-də yoxlayın)', en: 'Character quota (check on RapidAPI)' },
    hardLimit: false,
    verified: false,
    endpoints: [
      {
        operationId: 'externalTranslate',
        method: 'POST',
        upstream: '/language/translate/v2',
        query: [],
        produces: 'json',
        summary: { az: 'Tərcümə et', en: 'Translate' },
        example: { path: '/external/translate/language/translate/v2', body: { q: 'Salam, dünya!', source: 'az', target: 'en' } },
      },
      {
        operationId: 'externalTranslateLanguages',
        method: 'GET',
        upstream: '/language/translate/v2/languages',
        query: [],
        produces: 'json',
        summary: { az: 'Dillərin siyahısı', en: 'Supported languages' },
        example: { path: '/external/translate/language/translate/v2/languages' },
      },
    ],
  },
  {
    id: 'qr',
    name: 'QR Code Factory',
    host: 'qr-code-factory.p.rapidapi.com',
    rapidApiUrl: 'https://rapidapi.com/kodice/api/qr-code-factory',
    description: { az: 'QR kod şəkli — JSON olmayan cavab (image/png), Content-Type başlığı.', en: 'QR code image — a non-JSON response (image/png), the Content-Type header.' },
    freeLimit: { az: '500 000 sorğu/ay (Basic, $0)', en: '500,000 requests/month (Basic, $0)' },
    hardLimit: false,
    verified: false,
    endpoints: [
      {
        operationId: 'externalQr',
        method: 'GET',
        upstream: '/generate',
        query: ['d', 'size', 'type'],
        produces: 'image',
        summary: { az: 'QR kod yarat', en: 'Generate a QR code' },
        example: { path: '/external/qr/generate', query: { d: 'https://apilab.az', size: '300' } },
      },
    ],
  },
];

export const findApi = (catalog: ExternalApi[], id: string) => catalog.find((a) => a.id === id);

export function findEndpoint(catalog: ExternalApi[], operationId: string): { api: ExternalApi; endpoint: ExternalEndpoint } | undefined {
  for (const api of catalog) {
    const endpoint = api.endpoints.find((e) => e.operationId === operationId);
    if (endpoint) return { api, endpoint };
  }
  return undefined;
}
