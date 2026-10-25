// Superadmin (müəllim) paneli: bütün istifadəçilər, qruplar, tapşırıq nəticələri — yalnız oxu.
// Backend: GET /api/v1/admin/users, /admin/groups, /admin/users/{id}, /admin/results.csv (scope: superadmin)
import { api } from "./http";

export type AdminUserSummary = {
  id: number;
  username: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  groupName: string | null;
  role: "USER" | "ADMIN" | "SUPERADMIN";
  createdAt: string;
  lastLoginAt: string | null;
  progress: { done: number; total: number; percent: number };
  activity: { requests: number; lastRequestAt: string | null; sqlQueries: number };
};
export type AdminUserPage = { items: AdminUserSummary[]; page: number; size: number; total: number; totalPages: number };
export type AdminGroup = { groupName: string | null; students: number; avgPercent: number; completedAll: number; activeLast7Days: number };
export type AdminUserDetail = {
  user: AdminUserSummary;
  lessons: { lesson: number; done: number; total: number; percent: number }[];
  tasks: { id: number; lesson: number; title: string; method: string; path: string; expectedStatus: number; done: boolean; doneAt: string | null }[];
  recentRequests: { method: string; path: string; status: number; durationMs: number; createdAt: string }[];
  sqlQueries: { sql: string; result: string; rowCount: number | null; createdAt: string }[];
};
export type AdminUserFilter = { group?: string; q?: string; role?: string; sort?: string; page?: number; size?: number };

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  return search.size ? `?${search}` : "";
};

export const adminPanel = {
  users: async (f: AdminUserFilter = {}) => (await api.get<AdminUserPage>(`/api/v1/admin/users${query(f)}`)).data,
  groups: async () => (await api.get<{ items: AdminGroup[] }>("/api/v1/admin/groups")).data.items,
  user: async (id: number) => (await api.get<AdminUserDetail>(`/api/v1/admin/users/${id}`)).data,
  // CSV (UTF-8 BOM) → brauzerdə fayl kimi endirilir
  downloadResults: async (group?: string) => {
    const { data, headers } = await api.get<string>(`/api/v1/admin/results.csv${query({ group })}`, { accept: "text/csv" });
    const name = /filename="?([^";]+)"?/.exec(headers.get("content-disposition") ?? "")?.[1] ?? "api-lab-netice.csv";
    // response.text() BOM-u silir — Excel UTF-8-i (ə, ş, ğ) tanısın deyə geri əlavə olunur
    const csv = data.startsWith("\uFEFF") ? data : `\uFEFF${data}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  },
};
