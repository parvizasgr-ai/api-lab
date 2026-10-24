// Qeydiyyat formunun validasiyası — serverlə EYNİ qaydalar (openapi.yaml → RegisterRequest; server/src/modules/auth/register.ts).
// Client yoxlaması istifadəçiyə dərhal kömək üçündür; son söz həmişə serverindir (422/409 sahələrə xəritələnir).
export type RegisterField = "firstName" | "lastName" | "groupName" | "username" | "password" | "confirm";
export type RegisterForm = Record<RegisterField, string>;
type Lang = "az" | "en";

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿĞğİıŞşƏə";
export const NAME_RE = new RegExp(`^[${LETTER}]+(?:[ '-][${LETTER}]+)*$`);
export const GROUP_RE = new RegExp(`^[${LETTER}0-9]+(?:[ ._-][${LETTER}0-9]+)*$`);
export const USERNAME_RE = /^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$/;
export const RESERVED_USERNAMES = new Set(["admin", "administrator", "root", "superadmin", "superuser", "system", "support", "apilab", "api", "postgres", "null", "undefined", "me", "test", "guest", "moderator", "teacher", "muellim"]);
export const COMMON_PASSWORDS = new Set(["12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344", "password", "password1", "passw0rd", "qwertyui", "qwerty12", "qwerty123", "qwertyuiop", "asdfghjk", "iloveyou", "abcd1234", "abc12345", "azerbaijan", "azerbaycan", "baku1234", "parol123", "salam123", "admin123", "student123", "letmein1"]);

const M = {
  az: {
    required: "Bu sahə məcburidir",
    nameLen: "2–50 hərf",
    name: "Yalnız hərflər; tire, apostrof və boşluq hərflərin arasında",
    groupLen: "2–30 simvol",
    group: "Hərf və rəqəm; boşluq, nöqtə, alt xətt, tire ortada (məs. BA-2026-A)",
    usernameLen: "3–30 simvol",
    username: "Kiçik latın hərfləri və rəqəmlər; nöqtə və alt xətt ortada",
    reserved: "Bu username ehtiyatda saxlanılır",
    passwordLen: "Ən azı 8 simvol (maks. 64)",
    common: "Bu parol çox yayılmışdır — başqa parol seçin",
    sameAsUsername: "Parol username ilə eyni ola bilməz",
    containsName: "Parolda adınız və ya soyadınız olmamalıdır",
    repeated: "Parol eyni simvolun təkrarı ola bilməz",
    confirm: "Parollar eyni deyil",
  },
  en: {
    required: "This field is required",
    nameLen: "2–50 letters",
    name: "Letters only; hyphen, apostrophe and space between letters",
    groupLen: "2–30 characters",
    group: "Letters and digits; space, dot, underscore, hyphen in between (e.g. BA-2026-A)",
    usernameLen: "3–30 characters",
    username: "Lowercase latin letters and digits; dot and underscore in between",
    reserved: "This username is reserved",
    passwordLen: "At least 8 characters (max 64)",
    common: "This password is too common — choose another",
    sameAsUsername: "Password cannot equal the username",
    containsName: "Password must not contain your first or last name",
    repeated: "Password cannot be one repeated character",
    confirm: "Passwords do not match",
  },
};

const collapse = (s: string) => s.trim().replace(/\s+/g, " ");

export function normalizeRegistration(form: RegisterForm) {
  return {
    firstName: collapse(form.firstName),
    lastName: collapse(form.lastName),
    groupName: collapse(form.groupName),
    username: form.username.trim().toLowerCase(),
    password: form.password,
  };
}

export function validateRegistration(form: RegisterForm, lang: Lang): Partial<Record<RegisterField, string>> {
  const m = M[lang];
  const f = normalizeRegistration(form);
  const errors: Partial<Record<RegisterField, string>> = {};
  for (const key of ["firstName", "lastName"] as const) {
    const v = f[key];
    if (!v) errors[key] = m.required;
    else if (v.length < 2 || v.length > 50) errors[key] = m.nameLen;
    else if (!NAME_RE.test(v)) errors[key] = m.name;
  }
  if (!f.groupName) errors.groupName = m.required;
  else if (f.groupName.length < 2 || f.groupName.length > 30) errors.groupName = m.groupLen;
  else if (!GROUP_RE.test(f.groupName)) errors.groupName = m.group;

  if (!f.username) errors.username = m.required;
  else if (f.username.length < 3 || f.username.length > 30) errors.username = m.usernameLen;
  else if (!USERNAME_RE.test(f.username)) errors.username = m.username;
  else if (RESERVED_USERNAMES.has(f.username)) errors.username = m.reserved;

  const pw = f.password;
  const lower = pw.toLowerCase();
  if (!pw) errors.password = m.required;
  else if (pw.length < 8 || pw.length > 64) errors.password = m.passwordLen;
  else if (COMMON_PASSWORDS.has(lower)) errors.password = m.common;
  else if (f.username && lower === f.username) errors.password = m.sameAsUsername;
  else if ([f.firstName, f.lastName].some((n) => n.length >= 3 && lower.includes(n.toLowerCase()))) errors.password = m.containsName;
  else if (/^(.)\1+$/.test(pw)) errors.password = m.repeated;

  if (!form.confirm) errors.confirm = m.required;
  else if (form.confirm !== form.password) errors.confirm = m.confirm;
  return errors;
}

// Server xətası (422 details[].field = "/username" və s., 409 USERNAME_TAKEN) → form sahələri
export function serverFieldErrors(details: { field: string; message: string }[]): Partial<Record<RegisterField, string>> {
  const out: Partial<Record<RegisterField, string>> = {};
  for (const d of details) {
    const key = d.field.replace(/^\//, "") as RegisterField;
    if (["firstName", "lastName", "groupName", "username", "password"].includes(key)) out[key] ??= d.message;
  }
  return out;
}
