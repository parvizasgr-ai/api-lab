import { describe, expect, it } from "vitest";
import { parseRoute, pathOf, PROTECTED_PAGES } from "./routes";

describe("routes (QA-M04)", () => {
  it("URL → səhifə və tətbiq; sonda / və naməlum yollar", () => {
    expect(parseRoute("/")).toEqual({ page: "home", app: null });
    expect(parseRoute("/explorer")).toEqual({ page: "explorer", app: null });
    expect(parseRoute("/sql/")).toEqual({ page: "sql", app: null });
    expect(parseRoute("/apps/bank")).toEqual({ page: "apps", app: "bank" });
    expect(parseRoute("/apps/unknown")).toEqual({ page: "apps", app: null });
    expect(parseRoute("/bank")).toEqual({ page: "home", app: null });
    expect(parseRoute("/signin")).toEqual({ page: "signin", app: null });
  });

  it("səhifə → URL, round-trip", () => {
    expect(pathOf("home")).toBe("/");
    expect(pathOf("apps", "customers")).toBe("/apps/customers");
    expect(pathOf("materials", "bank")).toBe("/materials");
    for (const page of ["home", "explorer", "apps", "auth", "sql", "materials", "signin"] as const) expect(parseRoute(pathOf(page)).page).toBe(page);
  });

  it("qorunan səhifələr: home və signin deyil", () => {
    expect(PROTECTED_PAGES).not.toContain("home");
    expect(PROTECTED_PAGES).not.toContain("signin");
    expect(PROTECTED_PAGES).toContain("materials");
  });
});
