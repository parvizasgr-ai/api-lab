// Infrastruktur (/infra): Redis, Kafka, MongoDB — tələbə hər birinin "içini" canlı görür və təhlükəsiz sınaqlar edir.
// Aktiv tab URL-də saxlanılır (?tab=kafka) — paylaşıla və reload edilə bilər.
import { useState } from "react";
import KafkaTab from "./infra/KafkaTab";
import MongoTab from "./infra/MongoTab";
import RedisTab from "./infra/RedisTab";
import { TEXT } from "./infra/shared";

type Tab = "redis" | "kafka" | "mongo";
const TABS: Tab[] = ["redis", "kafka", "mongo"];

const initialTab = (): Tab => {
  const fromUrl = new URLSearchParams(window.location.search).get("tab");
  return fromUrl === "kafka" || fromUrl === "mongo" ? fromUrl : "redis";
};

export default function InfraPage({ language, username }: { language: "az" | "en"; username: string }) {
  const t = TEXT[language];
  const [tab, setTab] = useState<Tab>(initialTab);

  const select = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    document.getElementById(`infra-tab-${next}`)?.focus();
  };

  return (
    <main className="infra-page" id="main-content">
      <div className="infra-hero">
        <span className="section-kicker">{t.kicker}</span>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        <p className="infra-note">{t.simNote}</p>
      </div>
      <div aria-label={t.title} className="infra-tabs" role="tablist">
        {TABS.map((id, i) => (
          <button
            aria-controls="infra-tabpanel"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            id={`infra-tab-${id}`}
            key={id}
            onClick={() => select(id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") select(TABS[(i + 1) % TABS.length]);
              if (event.key === "ArrowLeft") select(TABS[(i + TABS.length - 1) % TABS.length]);
            }}
            role="tab"
            tabIndex={tab === id ? 0 : -1}
            type="button"
          >
            {t.tabs[id]}
          </button>
        ))}
      </div>
      <div aria-labelledby={`infra-tab-${tab}`} id="infra-tabpanel" role="tabpanel">
        {tab === "redis" && <RedisTab t={t} username={username} />}
        {tab === "kafka" && <KafkaTab t={t} />}
        {tab === "mongo" && <MongoTab t={t} />}
      </div>
    </main>
  );
}
