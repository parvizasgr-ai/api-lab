// Real URL routing (History API): reload və paylaşılan link eyni səhifəni açır.
// Server bu yolların hamısına portalın index.html-ini verir (SPA fallback, server/src/static.ts).
export type Page = "home" | "explorer" | "apps" | "auth" | "sql" | "materials" | "external" | "signin" | "register" | "admin" | "infra";
export type AppId = "bank" | "currency" | "flights" | "hotels" | "books" | "music" | "google" | "customers";

const PAGE_PATHS: Record<Page, string> = {
  home: "/",
  explorer: "/explorer",
  apps: "/apps",
  auth: "/auth",
  sql: "/sql",
  materials: "/materials",
  external: "/external-apis", // "/external/..." — server proxy-sidir, portal səhifəsi ayrı yoldadır
  signin: "/signin",
  register: "/register",
  admin: "/admin", // superadmin paneli (istifadəçilər, qruplar, nəticələr)
  infra: "/infra", // Redis / Kafka / MongoDB (?tab=kafka)
};
const APP_IDS: readonly AppId[] = ["bank", "currency", "flights", "hotels", "books", "music", "google", "customers"];

// Giriş tələb edən səhifələr: sessiya yoxdursa /signin, girişdən sonra bura qayıdılır
export const PROTECTED_PAGES: readonly Page[] = ["explorer", "apps", "auth", "sql", "materials", "external", "admin", "infra"];

// "/apps/bank/" → { page: "apps", app: "bank" }; naməlum yol → home
export function parseRoute(pathname: string): { page: Page; app: AppId | null } {
  const [first = "", second = ""] = pathname.replace(/^\/+|\/+$/g, "").split("/");
  const page = (Object.keys(PAGE_PATHS) as Page[]).find((p) => PAGE_PATHS[p] === `/${first}`) ?? "home";
  const app = page === "apps" && (APP_IDS as readonly string[]).includes(second) ? (second as AppId) : null;
  return { page, app };
}

export const pathOf = (page: Page, app: AppId | null = null) => (page === "apps" && app ? `/apps/${app}` : PAGE_PATHS[page]);
