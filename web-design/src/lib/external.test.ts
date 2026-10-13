import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, json, mockFetch } from "../test/fetchMock";

const KEY = "my-own-rapidapi-key-0123456789abcdef";

async function load() {
  vi.resetModules();
  return import("./external");
}

const joke = { operationId: "externalJoke", method: "GET" as const, path: "/external/jokes/joke/{category}", produces: "json" as const, summary: { az: "Zarafat", en: "Joke" }, example: { path: "/external/jokes/joke/Programming", query: { type: "single" } } };
const translate = { operationId: "externalTranslate", method: "POST" as const, path: "/external/translate/language/translate/v2", produces: "json" as const, summary: { az: "Tərcümə", en: "Translate" }, example: { path: "/external/translate/language/translate/v2", body: { q: "Salam", source: "az", target: "en" } } };
const qr = { operationId: "externalQr", method: "GET" as const, path: "/external/qr/generate", produces: "image" as const, summary: { az: "QR", en: "QR" }, example: { path: "/external/qr/generate", query: { d: "https://apilab.az" } } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("External APIs — açar yalnız yaddaşda", () => {
  it("set/clear/subscribe; localStorage, sessionStorage və cookie-yə yazılmır", async () => {
    const { externalKey } = await load();
    const seen: string[] = [];
    const off = externalKey.subscribe((k) => seen.push(k));
    externalKey.set(`  ${KEY}  `);
    expect(externalKey.get()).toBe(KEY);
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(KEY);
    expect(document.cookie).not.toContain(KEY);
    externalKey.clear();
    off();
    externalKey.set("ignored-after-unsubscribe-000000");
    expect(seen).toEqual([KEY, ""]);
  });

  it("modul yenidən yüklənəndə (reload) açar yoxdur", async () => {
    (await load()).externalKey.set(KEY);
    expect((await load()).externalKey.get()).toBe("");
  });
});

describe("External APIs — sorğular proxy-yə", () => {
  it("run: X-RapidAPI-Key başlığı (açar varsa), nümunə query, JSON cavab", async () => {
    const { external, externalKey } = await load();
    const calls = mockFetch(() => json(200, { joke: "x" }, { "X-Cache": "MISS" }));
    externalKey.set(KEY);
    const res = await external.run(joke);
    expect(calls[0].url).toBe("/external/jokes/joke/Programming?type=single");
    expect(calls[0].headers["x-rapidapi-key"]).toBe(KEY);
    expect(res).toMatchObject({ status: 200, body: { joke: "x" } });
  });

  it("açar yoxdursa başlıq göndərilmir; 503 EXTERNAL_KEY_MISSING → AuthClientError", async () => {
    const { external } = await load();
    const calls = mockFetch(() => json(503, apiError(503, "EXTERNAL_KEY_MISSING")));
    await expect(external.run(joke)).rejects.toMatchObject({ status: 503, code: "EXTERNAL_KEY_MISSING" });
    expect(calls[0].headers["x-rapidapi-key"]).toBeUndefined();
  });

  it("limit bitib: 502 EXTERNAL_RATE_LIMITED + Retry-After → retryAfter", async () => {
    const { external, externalKey } = await load();
    externalKey.set(KEY);
    mockFetch(() => json(502, apiError(502, "EXTERNAL_RATE_LIMITED"), { "Retry-After": "120" }));
    await expect(external.run(joke)).rejects.toMatchObject({ code: "EXTERNAL_RATE_LIMITED", retryAfter: 120 });
  });

  it("POST body nümunədən; şəkil cavabı Blob + object URL", async () => {
    const { external, externalKey } = await load();
    externalKey.set(KEY);
    const calls = mockFetch((call) =>
      call.url.startsWith("/external/qr") ? new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "Content-Type": "image/png" } }) : json(200, { data: {} }),
    );
    await external.run(translate);
    expect(calls[0]).toMatchObject({ method: "POST", body: JSON.stringify({ q: "Salam", source: "az", target: "en" }) });
    const createObjectURL = vi.fn(() => "blob:qr");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL }));
    const img = await external.run(qr);
    expect(img.body).toBeInstanceOf(Blob);
    expect(img.imageUrl).toBe("blob:qr");
  });

  it("Explorer handoff: metod, URL, açar başlığı (varsa) və JSON body", async () => {
    const { external, externalKey } = await load();
    expect(external.handoff(joke)).toEqual({ method: "GET", path: "/external/jokes/joke/Programming?type=single", headers: undefined, body: undefined });
    externalKey.set(KEY);
    const h = external.handoff(translate);
    expect(h.headers).toEqual({ "X-RapidAPI-Key": KEY });
    expect(JSON.parse(h.body!)).toEqual({ q: "Salam", source: "az", target: "en" });
  });
});
