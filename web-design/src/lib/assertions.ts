// Explorer → Tests: Postman-ın pm.test-inə bənzər sadə assertion-lar. Hər sətir = 1 test.
// Kod icra olunmur (eval yoxdur) — sətirlər parse olunur, ona görə CSP və təhlükəsizlik problemi yaratmır.
//
//   status == 200                      status in 200, 201          time < 500
//   header content-type contains json  header x-request-id exists
//   json $.status == "ok"              json $.items.length > 0     json $.items[0].id exists
//   json $.code matches ^INVALID_
//   pm.response.to.have.status(200)    pm.response.to.have.header("ETag")     (Postman forması)
//   # şərh

export type TestResult = { name: string; pass: boolean; message: string };
export type TestContext = { status: number; headers: Record<string, string>; body: unknown; time: number };

const OPS = ["==", "!=", ">=", "<=", ">", "<", "contains", "matches", "exists", "in"] as const;
type Op = (typeof OPS)[number];

function parseValue(raw: string): unknown {
  const text = raw.trim();
  if (text === "") return "";
  try {
    return JSON.parse(text);
  } catch {
    return text.replace(/^['"]|['"]$/g, "");
  }
}

// $.items[0].id, $["x-y"], $.items.length
export function readPath(value: unknown, path: string): { found: boolean; value: unknown } {
  if (!path.startsWith("$")) return { found: false, value: undefined };
  const tokens = [...path.slice(1).matchAll(/\.([A-Za-z_$][\w$-]*)|\[(\d+)\]|\["([^"]+)"\]/g)].map((m) => m[1] ?? m[3] ?? Number(m[2]));
  let current: unknown = value;
  for (const token of tokens) {
    if (token === "length" && (Array.isArray(current) || typeof current === "string")) {
      current = current.length;
      continue;
    }
    if (current === null || typeof current !== "object" || !(String(token) in (current as object))) return { found: false, value: undefined };
    current = (current as Record<string, unknown>)[String(token)];
  }
  return { found: true, value: current };
}

function compare(actual: unknown, op: Op, expected: unknown, found = true): boolean {
  switch (op) {
    case "exists":
      return found && actual !== undefined && actual !== null;
    case "==":
      return JSON.stringify(actual) === JSON.stringify(expected) || String(actual) === String(expected);
    case "!=":
      return !compare(actual, "==", expected);
    case ">":
      return Number(actual) > Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
    case "contains":
      return Array.isArray(actual) ? actual.some((item) => compare(item, "==", expected)) : String(actual ?? "").toLowerCase().includes(String(expected).toLowerCase());
    case "matches":
      try {
        return new RegExp(String(expected)).test(String(actual ?? ""));
      } catch {
        return false;
      }
    case "in":
      return String(expected)
        .split(",")
        .map((v) => v.trim())
        .includes(String(actual));
  }
}

// "<rest>" → [left, op, right]; op ilk rast gəlinən operatordur (boşluqla ayrılmış)
function splitOp(rest: string): { left: string; op: Op; right: string } | null {
  const match = new RegExp(`^(.*?)\\s+(${OPS.map((o) => o.replace(/[<>=!]/g, (c) => `\\${c}`)).join("|")})(?:\\s+(.*))?$`).exec(rest.trim());
  if (!match) return null;
  return { left: match[1].trim(), op: match[2] as Op, right: (match[3] ?? "").trim() };
}

const show = (value: unknown) => (typeof value === "string" ? `"${value}"` : JSON.stringify(value));

function runLine(line: string, ctx: TestContext): TestResult {
  const name = line;
  // Postman forması
  const pmStatus = /^pm\.response\.to\.have\.status\((\d{3})\)\s*;?$/.exec(line);
  if (pmStatus) return runLine(`status == ${pmStatus[1]}`, ctx);
  const pmHeader = /^pm\.response\.to\.have\.header\(\s*['"]([^'"]+)['"]\s*\)\s*;?$/.exec(line);
  if (pmHeader) return runLine(`header ${pmHeader[1]} exists`, ctx);

  const [kind, ...restParts] = line.split(/\s+/);
  const rest = restParts.join(" ");
  const fail = (message: string): TestResult => ({ name, pass: false, message });

  if (kind === "status" || kind === "time") {
    const parsed = splitOp(`${kind} ${rest}`);
    if (!parsed) return fail("Operator tapılmadı (==, !=, >, <, in ...)");
    const actual = kind === "status" ? ctx.status : ctx.time;
    const pass = compare(actual, parsed.op, parseValue(parsed.right));
    return { name, pass, message: `${kind} = ${actual}` };
  }
  if (kind === "header") {
    const parsed = splitOp(rest);
    if (!parsed) return fail("İstifadə: header <ad> exists | contains <dəyər> | == <dəyər>");
    const key = parsed.left.toLowerCase();
    const found = key in ctx.headers;
    const actual = ctx.headers[key];
    const pass = compare(actual, parsed.op, parseValue(parsed.right), found);
    return { name, pass, message: found ? `${parsed.left}: ${actual}` : `${parsed.left} başlığı yoxdur` };
  }
  if (kind === "json") {
    const parsed = splitOp(rest);
    if (!parsed) return fail("İstifadə: json $.path <op> <dəyər>");
    const { found, value } = readPath(ctx.body, parsed.left);
    const pass = compare(value, parsed.op, parseValue(parsed.right), found);
    return { name, pass, message: found ? `${parsed.left} = ${show(value)}` : `${parsed.left} tapılmadı` };
  }
  return fail("Naməlum assertion — status, time, header, json və ya pm.response.to.have.status(...)");
}

export function runTests(script: string, ctx: TestContext): TestResult[] {
  return script
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => runLine(line, ctx));
}

export const SAMPLE_TESTS = `# Hər sətir bir testdir (Send-dən sonra icra olunur)
status in 200, 201, 204
header content-type contains json
time < 1000
pm.response.to.have.header("X-Request-Id")`;
