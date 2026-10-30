import { describe, expect, it } from "vitest";
import { compareResults } from "./compare";
import { LESSONS } from "./lessons";

const rs = (columns: string[], rows: unknown[][]) => ({ columns, rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))) });

describe("SQL tapşırıq yoxlaması", () => {
  it("alias fərqi nəzərə alınmır, sıra (ordered=false) nəzərə alınmır, rəqəmlər normallaşır", () => {
    expect(compareResults(rs(["count"], [[5]]), rs(["say"], [["5"]]))).toEqual({ ok: true });
    expect(compareResults(rs(["a", "b"], [[1, "x"], [2, "y"]]), rs(["a", "b"], [[2, "y"], [1, "x"]]))).toEqual({ ok: true });
    expect(compareResults(rs(["r"], [[9.1]]), rs(["r"], [["9.10"]]))).toEqual({ ok: true });
  });

  it("səhv: sütun sayı, sətir sayı, dəyər, sıra (ordered=true)", () => {
    expect(compareResults(rs(["a"], [[1]]), rs(["a", "b"], [[1, 2]]))).toMatchObject({ ok: false, reason: "columns" });
    expect(compareResults(rs(["a"], [[1], [2]]), rs(["a"], [[1]]))).toMatchObject({ ok: false, reason: "rowCount" });
    expect(compareResults(rs(["a"], [[1]]), rs(["a"], [[2]]))).toMatchObject({ ok: false, reason: "values" });
    expect(compareResults(rs(["a"], [[1], [2]]), rs(["a"], [[2], [1]]), true)).toMatchObject({ ok: false, reason: "order" });
    expect(compareResults(rs(["a"], [[null]]), rs(["a"], [["∅x"]]))).toMatchObject({ ok: false });
  });

  it("dərslər: unikal id, hər dərsdə nümunə, yalnız oxuma SQL-i, tapşırıqlarda həll", () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LESSONS) {
      expect(l.examples.length, l.id).toBeGreaterThan(0);
      for (const sql of [...l.examples.map((e) => e.sql), l.exercise?.solution ?? "SELECT 1"]) {
        expect(sql.trim(), `${l.id}: ${sql}`).toMatch(/^(SELECT|WITH)\b/i);
        expect(sql, `${l.id}`).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i);
      }
    }
    for (const topic of ["where", "order-by", "distinct", "between", "aliases", "group-by", "having"]) expect(ids).toContain(topic);
  });
});
