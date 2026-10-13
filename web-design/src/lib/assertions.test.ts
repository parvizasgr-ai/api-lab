import { describe, expect, it } from "vitest";
import { readPath, runTests } from "./assertions";

const ctx = {
  status: 201,
  time: 42,
  headers: { "content-type": "application/json; charset=utf-8", "x-request-id": "req_abc", location: "/api/v1/customers/26" },
  body: { id: 26, email: "rena@example.az", items: [{ id: 1, tags: ["a", "b"] }, { id: 2 }], code: "INVALID_REASON", nested: { "x-y": true }, nothing: null },
};

describe("readPath", () => {
  it.each([
    ["$.id", 26],
    ["$.items[1].id", 2],
    ["$.items.length", 2],
    ["$.items[0].tags.length", 2],
    ['$.nested["x-y"]', true],
  ])("%s", (path, expected) => {
    expect(readPath(ctx.body, path)).toEqual({ found: true, value: expected });
  });

  it("olmayan yol", () => {
    expect(readPath(ctx.body, "$.missing.deep").found).toBe(false);
    expect(readPath(ctx.body, "items").found).toBe(false);
  });
});

describe("runTests", () => {
  it("pass olan assertion-lar", () => {
    const results = runTests(
      [
        "status == 201",
        "status in 200, 201",
        "time < 500",
        "header content-type contains json",
        "header X-Request-Id exists",
        'header location == "/api/v1/customers/26"',
        "json $.id == 26",
        'json $.email == "rena@example.az"',
        "json $.items.length > 1",
        "json $.items[0].tags contains b",
        "json $.code matches ^INVALID_",
        "pm.response.to.have.status(201)",
        'pm.response.to.have.header("Location")',
      ].join("\n"),
      ctx,
    );
    expect(results.filter((r) => !r.pass)).toEqual([]);
    expect(results).toHaveLength(13);
  });

  it("fail olan assertion-lar izahla", () => {
    const [status, header, json, nullValue, unknown] = runTests(
      ["status == 200", "header etag exists", "json $.items[5].id == 1", "json $.nothing exists", "expect(1).toBe(1)"].join("\n"),
      ctx,
    );
    expect(status).toMatchObject({ pass: false, message: "status = 201" });
    expect(header).toMatchObject({ pass: false, message: "etag başlığı yoxdur" });
    expect(json).toMatchObject({ pass: false, message: "$.items[5].id tapılmadı" });
    expect(nullValue.pass).toBe(false);
    expect(unknown.pass).toBe(false);
    expect(unknown.message).toContain("Naməlum");
  });

  it("şərhlər və boş sətirlər atlanır; kod icra olunmur", () => {
    const results = runTests("# şərh\n\n// başqa şərh\nstatus == 201\n", ctx);
    expect(results).toHaveLength(1);
    expect(runTests('json $.id == 26; alert("x")', ctx)[0].pass).toBe(false); // sadəcə mətn kimi müqayisə
  });
});
