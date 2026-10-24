import { describe, expect, it } from "vitest";
import { GROUP_RE, NAME_RE, USERNAME_RE, normalizeRegistration, serverFieldErrors, validateRegistration, type RegisterForm } from "./registration";

const ok: RegisterForm = { firstName: "Nərmin", lastName: "Quliyeva", groupName: "BA-2026-A", username: "nermin.q", password: "Gizli-Parol-77", confirm: "Gizli-Parol-77" };

describe("qeydiyyat validasiyası (serverlə eyni qaydalar)", () => {
  it("düzgün form — xəta yoxdur; boşluqlar normallaşır, username kiçik hərflə", () => {
    expect(validateRegistration(ok, "az")).toEqual({});
    expect(normalizeRegistration({ ...ok, firstName: "  Nərmin  ", username: " Nermin.Q " })).toMatchObject({ firstName: "Nərmin", username: "nermin.q" });
    expect(validateRegistration({ ...ok, username: "Nermin.Q" }, "az")).toEqual({}); // client kiçik hərfə çevirir
  });

  it("regex-lər openapi.yaml ilə eyni davranır", () => {
    for (const v of ["Gülşən", "Əhmədova-O'Neil", "Anna Maria"]) expect(NAME_RE.test(v), v).toBe(true);
    for (const v of ["N3rmin", "Quliyeva-", "<b>", " Ad"]) expect(NAME_RE.test(v), v).toBe(false);
    for (const v of ["BA-2026-A", "IT BA 2", "grp_1.a"]) expect(GROUP_RE.test(v), v).toBe(true);
    for (const v of ["BA;DROP", "-BA", "BA--"]) expect(GROUP_RE.test(v), v).toBe(false);
    for (const v of ["nermin.q", "aysel_2026", "abc"]) expect(USERNAME_RE.test(v), v).toBe(true);
    for (const v of [".nermin", "nermin.", "ne", "nermin q", "нермин"]) expect(USERNAME_RE.test(v), v).toBe(false);
  });

  it("sahə xətaları (AZ/EN): məcburi, uzunluq, ehtiyatdakı username, zəif parol, təkrar parol", () => {
    const empty = validateRegistration({ firstName: "", lastName: "", groupName: "", username: "", password: "", confirm: "" }, "az");
    expect(Object.keys(empty).sort()).toEqual(["confirm", "firstName", "groupName", "lastName", "password", "username"]);
    expect(validateRegistration({ ...ok, username: "admin" }, "az").username).toBe("Bu username ehtiyatda saxlanılır");
    expect(validateRegistration({ ...ok, password: "Abc-123", confirm: "Abc-123" }, "en").password).toBe("At least 8 characters (max 64)");
    expect(validateRegistration({ ...ok, password: "12345678", confirm: "12345678" }, "az").password).toContain("yayılmış");
    expect(validateRegistration({ ...ok, password: "nermin.q", confirm: "nermin.q" }, "az").password).toContain("username");
    expect(validateRegistration({ ...ok, password: "Quliyeva2026", confirm: "Quliyeva2026" }, "az").password).toContain("soyadınız");
    expect(validateRegistration({ ...ok, confirm: "başqa" }, "az").confirm).toBe("Parollar eyni deyil");
  });

  it("server details → sahələr", () => {
    expect(serverFieldErrors([{ field: "/username", message: "nermin.q" }, { field: "/password", message: "zəif" }, { field: "/role", message: "x" }])).toEqual({ username: "nermin.q", password: "zəif" });
  });
});
