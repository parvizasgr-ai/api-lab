// Müəllim paneli (/admin, yalnız SUPERADMIN): qruplar üzrə xülasə, istifadəçi cədvəli (filter, axtarış, sıralama),
// istifadəçi detalları (dərslər, tapşırıqlar, son API və SQL sorğuları) və nəticələrin CSV-yə endirilməsi.
import { useEffect, useRef, useState } from "react";
import { adminPanel, type AdminGroup, type AdminUserDetail, type AdminUserPage } from "./lib/admin";

type Language = "az" | "en";

const TEXT = {
  az: {
    kicker: "MÜƏLLİM PANELİ",
    title: "Tələbələr və nəticələr",
    subtitle: "Qeydiyyatdan keçən bütün istifadəçilər, tapşırıq irəliləyişi və API / SQL aktivliyi.",
    groups: "Qruplar",
    noGroup: "Qrupsuz",
    students: "tələbə",
    avg: "orta nəticə",
    completedAll: "hamısını bitirib",
    active7: "son 7 gündə aktiv",
    search: "Ad, soyad və ya username",
    allGroups: "Bütün qruplar",
    allRoles: "Bütün rollar",
    roleUser: "Tələbə",
    roleAdmin: "Admin",
    roleSuperadmin: "Superadmin",
    sort: "Sıralama",
    sortName: "Ad (A–Z)",
    sortProgressDesc: "Nəticə (yüksəkdən)",
    sortProgressAsc: "Nəticə (aşağıdan)",
    sortLastLogin: "Son giriş",
    sortCreated: "Qeydiyyat tarixi",
    sortRequests: "API sorğuları",
    download: "Nəticələri CSV-yə endir",
    downloading: "Endirilir…",
    colName: "Ad Soyad",
    colGroup: "Qrup",
    colProgress: "Tapşırıqlar",
    colRequests: "API sorğuları",
    colSql: "SQL",
    colLastLogin: "Son giriş",
    never: "heç vaxt",
    empty: "Bu filterə uyğun istifadəçi yoxdur.",
    loadError: "Məlumat yüklənmədi",
    retry: "Yenidən cəhd et",
    prev: "Əvvəlki",
    next: "Növbəti",
    pageOf: (page: number, pages: number, total: number) => `Səhifə ${page} / ${Math.max(pages, 1)} · cəmi ${total}`,
    close: "Bağla",
    lessons: "Dərslər",
    lesson: (n: number) => `Dərs ${n}`,
    tasks: "Tapşırıqlar",
    done: "Tamamlanıb",
    notDone: "Tamamlanmayıb",
    recentRequests: "Son API sorğuları",
    sqlQueries: "Son SQL sorğuları",
    none: "Hələ yoxdur",
    registered: "Qeydiyyat",
    rows: "sətir",
    details: "Ətraflı",
  },
  en: {
    kicker: "TEACHER PANEL",
    title: "Students and results",
    subtitle: "All registered users, task progress and API / SQL activity.",
    groups: "Groups",
    noGroup: "No group",
    students: "students",
    avg: "average",
    completedAll: "completed all",
    active7: "active in last 7 days",
    search: "Name, surname or username",
    allGroups: "All groups",
    allRoles: "All roles",
    roleUser: "Student",
    roleAdmin: "Admin",
    roleSuperadmin: "Superadmin",
    sort: "Sort",
    sortName: "Name (A–Z)",
    sortProgressDesc: "Progress (high first)",
    sortProgressAsc: "Progress (low first)",
    sortLastLogin: "Last sign-in",
    sortCreated: "Registration date",
    sortRequests: "API requests",
    download: "Download results (CSV)",
    downloading: "Downloading…",
    colName: "Full name",
    colGroup: "Group",
    colProgress: "Tasks",
    colRequests: "API requests",
    colSql: "SQL",
    colLastLogin: "Last sign-in",
    never: "never",
    empty: "No users match this filter.",
    loadError: "Could not load data",
    retry: "Try again",
    prev: "Previous",
    next: "Next",
    pageOf: (page: number, pages: number, total: number) => `Page ${page} / ${Math.max(pages, 1)} · ${total} total`,
    close: "Close",
    lessons: "Lessons",
    lesson: (n: number) => `Lesson ${n}`,
    tasks: "Tasks",
    done: "Done",
    notDone: "Not done",
    recentRequests: "Recent API requests",
    sqlQueries: "Recent SQL queries",
    none: "None yet",
    registered: "Registered",
    rows: "rows",
    details: "Details",
  },
};

const PAGE_SIZE = 25;
const errorText = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} className="admin-progress" role="progressbar">
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export default function AdminPage({ language }: { language: Language }) {
  const t = TEXT[language];
  const locale = language === "az" ? "az-AZ" : "en-GB";
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : t.never);

  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [data, setData] = useState<AdminUserPage | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [role, setRole] = useState("USER");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // Axtarış: yazmağı bitirəndən 300 ms sonra
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const load = () => {
    setError("");
    adminPanel.groups().then(setGroups).catch((caught) => setError(errorText(caught)));
  };
  useEffect(load, []);

  useEffect(() => {
    let cancelled = false;
    adminPanel
      .users({ q: search || undefined, group: group || undefined, role: role || undefined, sort, page, size: PAGE_SIZE })
      .then((next) => !cancelled && setData(next))
      .catch((caught) => !cancelled && setError(errorText(caught)));
    return () => {
      cancelled = true;
    };
  }, [search, group, role, sort, page]);

  const download = async () => {
    setDownloading(true);
    try {
      await adminPanel.downloadResults(group || undefined);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setDownloading(false);
    }
  };

  const groupNames = groups.map((g) => g.groupName).filter((g): g is string => Boolean(g));

  return (
    <main className="admin-page" id="main-content">
      <div className="admin-hero">
        <div>
          <span className="section-kicker">{t.kicker}</span>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <button className="admin-download" disabled={downloading} onClick={() => void download()} type="button">
          {downloading ? t.downloading : t.download}
        </button>
      </div>

      {error && (
        <div className="admin-error" role="alert">
          <strong>{t.loadError}</strong>
          <span>{error}</span>
          <button onClick={load} type="button">{t.retry}</button>
        </div>
      )}

      <section aria-label={t.groups} className="admin-groups">
        {groups.map((g) => (
          <button
            aria-pressed={group === (g.groupName ?? "")}
            className={group === (g.groupName ?? "") && g.groupName ? "admin-group active" : "admin-group"}
            disabled={!g.groupName}
            key={g.groupName ?? "-"}
            onClick={() => {
              setGroup(group === g.groupName ? "" : (g.groupName ?? ""));
              setPage(1);
            }}
            type="button"
          >
            <strong>{g.groupName ?? t.noGroup}</strong>
            <span>{g.students} {t.students}</span>
            <ProgressBar label={`${g.groupName ?? t.noGroup}: ${g.avgPercent}%`} percent={g.avgPercent} />
            <small>{t.avg}: {g.avgPercent}% · {t.completedAll}: {g.completedAll} · {t.active7}: {g.activeLast7Days}</small>
          </button>
        ))}
      </section>

      <div className="admin-filters">
        <label>
          <span className="sr-only">{t.search}</span>
          <input onChange={(event) => setQ(event.target.value)} placeholder={t.search} type="search" value={q} />
        </label>
        <label>
          <span className="sr-only">{t.colGroup}</span>
          <select onChange={(event) => { setGroup(event.target.value); setPage(1); }} value={group}>
            <option value="">{t.allGroups}</option>
            {groupNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">{t.allRoles}</span>
          <select onChange={(event) => { setRole(event.target.value); setPage(1); }} value={role}>
            <option value="">{t.allRoles}</option>
            <option value="USER">{t.roleUser}</option>
            <option value="ADMIN">{t.roleAdmin}</option>
            <option value="SUPERADMIN">{t.roleSuperadmin}</option>
          </select>
        </label>
        <label>
          <span className="sr-only">{t.sort}</span>
          <select onChange={(event) => { setSort(event.target.value); setPage(1); }} value={sort}>
            <option value="name">{t.sortName}</option>
            <option value="-progress">{t.sortProgressDesc}</option>
            <option value="progress">{t.sortProgressAsc}</option>
            <option value="-lastLogin">{t.sortLastLogin}</option>
            <option value="-createdAt">{t.sortCreated}</option>
            <option value="-requests">{t.sortRequests}</option>
          </select>
        </label>
      </div>

      <div className="admin-table-card">
        <table>
          <thead>
            <tr>
              <th scope="col">{t.colName}</th>
              <th scope="col">{t.colGroup}</th>
              <th scope="col">{t.colProgress}</th>
              <th scope="col">{t.colRequests}</th>
              <th scope="col">{t.colSql}</th>
              <th scope="col">{t.colLastLogin}</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td>
                  <button className="admin-user-link" onClick={() => setSelected(u.id)} type="button">
                    <strong>{u.fullName}</strong>
                    <code>{u.username}</code>
                  </button>
                </td>
                <td>{u.groupName ?? "—"}</td>
                <td>
                  <div className="admin-progress-cell">
                    <ProgressBar label={`${u.fullName}: ${u.progress.percent}%`} percent={u.progress.percent} />
                    <span>{u.progress.done} / {u.progress.total}</span>
                  </div>
                </td>
                <td>{u.activity.requests}</td>
                <td>{u.activity.sqlQueries}</td>
                <td>{when(u.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="admin-empty" role="status">{t.empty}</p>}
      </div>

      {data && (
        <nav aria-label={t.pageOf(data.page, data.totalPages, data.total)} className="admin-pager">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} type="button">{t.prev}</button>
          <span>{t.pageOf(data.page, data.totalPages, data.total)}</span>
          <button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} type="button">{t.next}</button>
        </nav>
      )}

      {selected !== null && <UserDrawer onClose={() => setSelected(null)} t={t} userId={selected} when={when} />}
    </main>
  );
}

function UserDrawer({ userId, onClose, t, when }: { userId: number; onClose: () => void; t: (typeof TEXT)["az"]; when: (iso: string | null) => string }) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDetail(null);
    adminPanel.user(userId).then(setDetail).catch((caught) => setError(errorText(caught)));
  }, [userId]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="admin-drawer-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <aside aria-labelledby="admin-drawer-title" aria-modal="true" className="admin-drawer" role="dialog">
        <header>
          <div>
            <h2 id="admin-drawer-title">{detail?.user.fullName ?? t.details}</h2>
            {detail && <p><code>{detail.user.username}</code> · {detail.user.groupName ?? t.noGroup} · {t.registered}: {when(detail.user.createdAt)}</p>}
          </div>
          <button aria-label={t.close} className="admin-drawer-close" onClick={onClose} ref={closeRef} type="button">×</button>
        </header>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {detail && (
          <>
            <section>
              <h3>{t.lessons}</h3>
              <div className="admin-lessons">
                {detail.lessons.map((l) => (
                  <div key={l.lesson}>
                    <strong>{t.lesson(l.lesson)}</strong>
                    <ProgressBar label={`${t.lesson(l.lesson)}: ${l.percent}%`} percent={l.percent} />
                    <span>{l.done} / {l.total}</span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3>{t.tasks}</h3>
              <ul className="admin-task-list">
                {detail.tasks.map((task) => (
                  <li className={task.done ? "done" : ""} key={task.id}>
                    <span aria-label={task.done ? t.done : t.notDone} className="admin-task-mark" role="img">{task.done ? "✓" : "○"}</span>
                    <span>
                      <strong>{task.title}</strong>
                      <code>{task.method} {task.path} → {task.expectedStatus}</code>
                    </span>
                    <small>{task.done ? when(task.doneAt) : ""}</small>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>{t.recentRequests}</h3>
              {detail.recentRequests.length === 0 ? <p className="admin-muted">{t.none}</p> : (
                <ul className="admin-log">
                  {detail.recentRequests.map((r, i) => (
                    <li key={i}><code>{r.method} {r.path}</code><span className={r.status >= 400 ? "bad" : "ok"}>{r.status}</span><small>{when(r.createdAt)}</small></li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3>{t.sqlQueries}</h3>
              {detail.sqlQueries.length === 0 ? <p className="admin-muted">{t.none}</p> : (
                <ul className="admin-log">
                  {detail.sqlQueries.map((s, i) => (
                    <li key={i}><code>{s.sql}</code><span className={s.result === "OK" ? "ok" : "bad"}>{s.result}{s.rowCount !== null ? ` · ${s.rowCount} ${t.rows}` : ""}</span><small>{when(s.createdAt)}</small></li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
