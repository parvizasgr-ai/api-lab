// Tapşırıq yoxlaması: tələbənin nəticəsi gözlənilən nəticə ilə müqayisə olunur.
//   * Sütun ADLARI yox, sütun SAYI və DƏYƏRLƏRİ yoxlanılır (alias sərbəstdir: COUNT(*) və COUNT(*) AS say eynidir).
//   * ordered=false → sətirlərin sırası nəzərə alınmır (multiset); ordered=true → sıra da eyni olmalıdır (ORDER BY dərsləri).
//   * Rəqəmlər normallaşdırılır: 9.10 = 9.1, "5" = 5.
export type ResultSet = { columns: string[]; rows: Record<string, unknown>[] };

export type Verdict = { ok: true } | { ok: false; reason: "columns" | "rowCount" | "values" | "order"; expected: number; actual: number };

const norm = (v: unknown): string => {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()))) return String(Number(v));
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};

const rowKey = (r: ResultSet, i: number) => r.columns.map((c) => norm(r.rows[i][c])).join("␟");

export function compareResults(expected: ResultSet, actual: ResultSet, ordered = false): Verdict {
  if (expected.columns.length !== actual.columns.length) return { ok: false, reason: "columns", expected: expected.columns.length, actual: actual.columns.length };
  if (expected.rows.length !== actual.rows.length) return { ok: false, reason: "rowCount", expected: expected.rows.length, actual: actual.rows.length };
  const e = expected.rows.map((_, i) => rowKey(expected, i));
  const a = actual.rows.map((_, i) => rowKey(actual, i));
  const same = [...e].sort().join("\n") === [...a].sort().join("\n");
  if (!same) return { ok: false, reason: "values", expected: e.length, actual: a.length };
  if (ordered && e.join("\n") !== a.join("\n")) return { ok: false, reason: "order", expected: e.length, actual: a.length };
  return { ok: true };
}
