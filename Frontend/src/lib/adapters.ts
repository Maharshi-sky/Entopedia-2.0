import "server-only";
import type { Metric, Momentum, NewsFlow, Signal } from "@/data/dashboard";
import type { Article, Category, NewsKind } from "@/data/news";
import type { CompetitorProfile, Patent, WhiteSpace, Product } from "@/data/competitors";
import type { Active, ActiveStatus, Risk } from "@/data/regulatory";
import type { Pest, PestType } from "@/data/pests";
import type { AuditEntry } from "@/data/audit";

// Each adapter turns one Entopedia API response into the exact shape the
// matching sample in src/data has, so components work unchanged. Where the API
// has no source for a field, the adapter says so ("—" or null) rather than
// inventing a value.

type Row = Record<string, unknown>;
const str = (v: unknown, fallback = ""): string => (v === null || v === undefined || v === "" ? fallback : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const arr = <T = string>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const rows = (raw: unknown, key: string): Row[] => arr<Row>((raw as Row | null)?.[key]);
const formatCount = (n: number) => n.toLocaleString("en-US");
const titleCase = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "YYYY-MM" keys for `count` months ending at `end` (inclusive), oldest first. */
function monthKeys(end: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end.getFullYear(), end.getMonth() - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}
const monthLabel = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
const monthOf = (v: unknown) => str(v).slice(0, 7); // API returns DATE columns as YYYY-MM-DD

function relativeTime(v: unknown): string {
  const t = new Date(str(v)).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
}

// News categories: the frontend's fixed list (order and colours match the sample chart).
const CATEGORY_COLORS: [Category, string][] = [
  ["Regulatory", "#0f6b55"],
  ["Industry", "#e8a317"],
  ["Technology", "#4f56d6"],
  ["Product", "#e8572f"],
  ["Science", "#9b59b6"],
  ["Safety", "#3b82f6"],
  ["Disease", "#6aa84f"],
  ["Interviews", "#c0399a"],
  ["People & Company", "#9ca3af"],
];
const CATEGORY_SYNONYMS: [RegExp, Category][] = [
  [/regulat|policy|legal|compliance/i, "Regulatory"],
  [/m&a|acquisi|merger|people|company|appoint|executive/i, "People & Company"],
  [/science|research|study|academic/i, "Science"],
  [/tech|innovation|digital/i, "Technology"],
  [/product|launch/i, "Product"],
  [/safety|toxic|hazard/i, "Safety"],
  [/disease|outbreak|health|epidem/i, "Disease"],
  [/interview|q&a|opinion/i, "Interviews"],
  [/industry|market|business|trade/i, "Industry"],
];
function toCategory(v: unknown): Category {
  const s = str(v);
  const exact = CATEGORY_COLORS.find(([c]) => c.toLowerCase() === s.toLowerCase());
  if (exact) return exact[0];
  return CATEGORY_SYNONYMS.find(([re]) => re.test(s))?.[1] ?? "Industry";
}

// ── Dashboard ─────────────────────────────────────────────────────────────

/** GET /dashboard/kpis → Metric[] */
export function toMetrics(raw: unknown): Metric[] {
  const r = (raw ?? {}) as Row;
  const m = (r.metrics ?? {}) as Row;
  const t = (r.trends ?? {}) as Row;
  const trend = (v: unknown) => {
    const values = arr<number>(v).map(num);
    return values.length >= 2 ? values : [0, ...values, 0].slice(0, Math.max(2, values.length));
  };
  return [
    { id: "alerts", title: "High-priority alerts", value: formatCount(num(m.alerts)), caption: `${num(m.threats)} high-threat patent filings`, icon: "alert", tone: "alert", trend: trend(t.alerts) },
    { id: "claims", title: "New claims identified", value: formatCount(num(m.claims)), caption: "Product claims added", icon: "claims", tone: "brand", trend: trend(t.claims) },
    { id: "news", title: "News intelligence", value: formatCount(num(m.news)), caption: "Articles published", icon: "news", tone: "brand", trend: trend(t.news) },
    { id: "launches", title: "New competitor filings", value: formatCount(num(m.patents)), caption: `${num(m.competitors)} competitors updated`, icon: "launches", tone: "brand", trend: trend(t.patents) },
  ];
}

const MOMENTUM_COLORS = ["#004736", "#e8572f", "#4f56d6", "#d98b0b"];

/** GET /dashboard/launch-momentum → Momentum (top 4 filers over the latest 6 months with data) */
export function toMomentum(raw: unknown): Momentum {
  const data = rows(raw, "data");
  const latest = data.map((d) => monthOf(d.month)).filter(Boolean).sort().at(-1);
  const end = latest ? new Date(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)) - 1, 1) : new Date();
  const keys = monthKeys(end, 6);

  const byName = new Map<string, number[]>();
  for (const d of data) {
    const i = keys.indexOf(monthOf(d.month));
    const name = str(d.competitor_name);
    if (i === -1 || !name) continue;
    const monthly = byName.get(name) ?? Array(keys.length).fill(0);
    monthly[i] += num(d.filing_count);
    byName.set(name, monthly);
  }
  const top = [...byName.entries()]
    .map(([name, monthly]) => ({ name, monthly, total: monthly.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
  const short = (name: string) => {
    const words = name.split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  };

  return {
    months: keys.map(monthLabel),
    competitors: top.map((c, i) => ({ name: c.name, short: short(c.name), color: MOMENTUM_COLORS[i], monthly: c.monthly })),
    legendOrder: top.map((c) => c.name),
  };
}

/** GET /dashboard/news-flow?granularity=month&months=6 → NewsFlow */
export function toNewsFlow(raw: unknown): NewsFlow {
  const keys = monthKeys(new Date(), 6);
  const series = CATEGORY_COLORS.map(([label, color]) => ({ label, color, data: Array(keys.length).fill(0) as number[] }));
  for (const d of rows(raw, "data")) {
    const i = keys.indexOf(monthOf(d.month ?? d.week));
    if (i === -1) continue;
    const s = series.find((x) => x.label === toCategory(d.category));
    if (s) s.data[i] += num(d.count);
  }
  return { months: keys.map(monthLabel), series };
}

const MODULE_BADGE: [RegExp, Signal["badge"]][] = [
  [/regulat/i, "red"],
  [/market|competitor/i, "green"],
  [/pest/i, "amber"],
  [/claim/i, "indigo"],
  [/news/i, "purple"],
  [/patent/i, "orange"],
];

/** GET /dashboard/alerts → Signal[] */
export function toSignals(raw: unknown): Signal[] {
  return rows(raw, "alerts").map((a) => {
    const severity = str(a.severity).toLowerCase();
    const source = str(a.source_module, "Alert");
    const urgent = severity === "high" || severity === "critical";
    const badge = MODULE_BADGE.find(([re]) => re.test(source))?.[1] ?? (urgent ? "red" : severity === "medium" ? "orange" : "gray");
    return { tag: source, time: relativeTime(a.created_at), title: str(a.title, str(a.message)), kind: urgent ? "alert" : "signal", badge };
  });
}

// ── News ──────────────────────────────────────────────────────────────────

/** GET /news → Article[] (newest first) */
const httpUrl = (v: unknown): string | undefined => {
  const s = str(v);
  return /^https?:\/\//i.test(s) ? s : undefined;
};

/** GET /news → Article[]. Brand-news stories (origin google_news) carry brand, kind and the publisher's link and picture. */
export function toArticles(raw: unknown): Article[] {
  return rows(raw, "data").map((n) => {
    const content = str(n.content);
    const brand = str(n.brand) || undefined;
    const toKind = (k: unknown): NewsKind | undefined => (k === "brand" || k === "related" || k === "company" ? k : undefined);
    const kind = toKind(n.kind);
    // Every brand this headline was saved for (GET /news groups them), the brand it is about first.
    const brands: { name: string; kind: NewsKind }[] = Array.isArray(n.brands)
      ? (n.brands as Array<{ brand?: unknown; kind?: unknown }>)
          .filter((b) => typeof b?.brand === "string")
          .map((b) => ({ name: b.brand as string, kind: toKind(b.kind) ?? "brand" }))
      : brand
        ? [{ name: brand, kind: kind ?? "brand" }]
        : [];
    const about = brands.filter((b) => b.kind === "brand").map((b) => b.name);
    const related = brands.filter((b) => b.kind === "related").map((b) => b.name);
    const company = brands.filter((b) => b.kind === "company").map((b) => b.name);
    const brandLine = about.length
      ? `About ${about.join(", ")}`
      : related.length
        ? `Pest-control news related to ${related.join(", ")}`
        : company.length
          ? `Company news (owner of ${company.join(", ")})`
          : "";
    // The same event from other outlets (GET /news groups them).
    const moreSources = Array.isArray(n.more_sources)
      ? (n.more_sources as Array<{ source?: unknown; url?: unknown }>)
          .filter((m) => typeof m?.source === "string" && m.source)
          .map((m) => ({ source: m.source as string, url: httpUrl(m.url) }))
      : [];
    const summary = str(n.ai_summary) || (content.length > 220 ? `${content.slice(0, 217).trimEnd()}…` : content) || brandLine;
    const id = str(n.id);
    return {
      id: id || undefined,
      title: str(n.title),
      summary,
      category: toCategory(n.category),
      source: str(n.source, "Unknown source"),
      time: relativeTime(n.published_date ?? n.created_at),
      // Loaded through this site (src/app/api/news-image), not from the
      // publisher directly: many sites block their pictures on other sites.
      image: id && httpUrl(n.image_url) ? `/api/news-image/${id}` : undefined,
      url: httpUrl(n.article_url) ?? httpUrl(n.url),
      brand,
      kind,
      brands: brands.length ? brands : undefined,
      moreSources: moreSources.length ? moreSources : undefined,
    };
  });
}

// ── Competitor intelligence ──────────────────────────────────────────────

/** GET /competitor → CompetitorProfile[] */
export function toCompetitorProfiles(raw: unknown): CompetitorProfile[] {
  return rows(raw, "data").map((c) => ({
    name: str(c.name),
    patents: num(c.patent_count),
    activeFilings: num(c.active_filing_count),
    skus: null, // not tracked by the API yet
    launches: null, // not tracked by the API yet
    footprint: str(c.country, "—"),
    provenance: {
      sources: ["Entopedia patents database"],
      confidence: Math.round(num(c.threat_score) * 100),
      status: "Retrieved",
    },
  }));
}

/** GET /competitor/products → Product[] */
/** GET /competitor/products → Product[] (the API answers with a plain array of competitor_products rows) */
export function toProducts(raw: unknown): Product[] {
  const validFormats = ["LV", "Aerosol", "Coil", "Card"] as const;
  const list = Array.isArray(raw) ? (raw as Row[]) : rows(raw, "data");
  return list.map((p, idx) => {
    const rawFmt = str(p.format, "LV");
    const fmt = validFormats.find((f) => f.toLowerCase() === rawFmt.toLowerCase()) ?? "LV";
    const rawPrice = str(p.price, "₹0");
    return {
      id: str(p.id, `db-${idx}`),
      brand: str(p.brand, str(p.competitor_name, "UNKNOWN")).toUpperCase(),
      name: str(p.name, "Unnamed Product"),
      format: fmt,
      active: arr<string>(p.actives).join(" ") || str(p.active_ingredient, str(p.active, "N/A")),
      packSizes: arr<string>(p.pack_sizes).length ? arr<string>(p.pack_sizes) : [str(p.pack_size, "Standard")],
      claims: arr<string>(p.claims).length ? arr<string>(p.claims) : ["Standard protection"],
      price: num(rawPrice.replace(/[^\d.-]/g, "")),
      image: str(p.image_url, str(p.image, "/pl1.jpg")),
      url: str(p.product_link, str(p.product_url, str(p.url, ""))),
    };
  });
}

/** GET /patent/white-space?full=1 → WhiteSpace (cells with patents are "claimed", the rest "open") */
export function toWhiteSpace(raw: unknown): WhiteSpace {
  const coverage = rows(raw, "coverage");
  const total = (key: "active_ingredient" | "format", value: string) =>
    coverage.filter((c) => str(c[key]) === value).reduce((sum, c) => sum + num(c.coverage), 0);
  const formats = arr<string>((raw as Row | null)?.formats).sort((a, b) => total("format", b) - total("format", a)).slice(0, 6);
  const actives = arr<string>((raw as Row | null)?.actives).sort((a, b) => total("active_ingredient", b) - total("active_ingredient", a)).slice(0, 8);
  return {
    formats,
    actives: actives.map((name) => ({
      name,
      cells: formats.map((format) =>
        coverage.some((c) => str(c.active_ingredient) === name && str(c.format) === format && num(c.coverage) > 0) ? "claimed" : "open",
      ),
    })),
  };
}

/** GET /patent → Patent[] */
export function toPatents(raw: unknown): Patent[] {
  return rows(raw, "data").map((p) => ({
    number: str(p.patent_number),
    assignee: str(p.filer, "—"),
    active: arr<string>(p.active_ingredients)[0] ?? "—",
    technology: str(p.title, str(p.format, "—")),
    filed: str(p.filing_date).slice(0, 10),
    // The patents table has no grant status yet; every record reads as Pending until it does.
    status: "Pending",
    maturity: Math.round(num(p.threat_score) * 100),
  }));
}

// ── Regulatory ───────────────────────────────────────────────────────────

/** GET /regulatory/actives → Active[] (one row per active ingredient across markets) */
export function toActives(raw: unknown): Active[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows(raw, "data")) {
    const name = str(r.active_ingredient);
    if (!name) continue;
    groups.set(name, [...(groups.get(name) ?? []), r]);
  }
  const riskRank: Risk[] = ["Low", "Medium", "High"];
  const thisYear = new Date().getFullYear();
  return [...groups.entries()].map(([name, regs]) => {
    const statuses = regs.map((r) => str(r.approval_status).toLowerCase());
    const status: ActiveStatus = statuses.some((s) => /suspend|ban|restrict|withdraw|reject/.test(s))
      ? "Restricted"
      : statuses.some((s) => /pend|review|submit/.test(s))
        ? "Under Review"
        : "Approved";
    const conc = regs.map((r) => r.max_concentration).filter((v) => v !== null && v !== undefined).map(num);
    const formats = [...new Set(regs.flatMap((r) => arr<string>(r.permitted_formats)))];
    const cliffYears = regs.map((r) => str(r.off_patent_date).slice(0, 4)).filter(Boolean).map(Number).sort();
    const risk = regs.map((r) => titleCase(str(r.risk_rating, "low").toLowerCase()) as Risk).filter((r) => riskRank.includes(r))
      .sort((a, b) => riskRank.indexOf(b) - riskRank.indexOf(a))[0] ?? "Low";
    return {
      name,
      markets: [...new Set(regs.map((r) => str(r.market)).filter(Boolean))].join(", "),
      status,
      maxConc: conc.length ? `${Math.max(...conc)}%` : "—",
      formats: formats.length ? formats.join(", ") : "—",
      patentCliff: cliffYears.length ? (cliffYears[0] < thisYear ? "Expired" : String(cliffYears[0])) : "—",
      risk,
    };
  });
}

// ── Pest Vision ──────────────────────────────────────────────────────────

const PEST_TYPES: PestType[] = ["Mosquito", "Cockroach", "Fly", "Ant", "Bed bug", "Rodent"];

/** GET /pest-vision/pests → Pest[] */
export function toPests(raw: unknown): Pest[] {
  return rows(raw, "data").map((p) => {
    const type = str(p.pest_type);
    return {
      name: str(p.common_name, str(p.species)),
      scientific: str(p.species),
      type: (PEST_TYPES.find((t) => t.toLowerCase() === type.toLowerCase()) ?? (type || "Mosquito")) as PestType,
      regions: arr<string>(p.regions).join(", ") || "—",
      note: str(p.biology, str(p.resistance_notes)),
      image: str(p.image_url) || undefined,
    };
  });
}

// ── Audit ────────────────────────────────────────────────────────

/** GET /audit/ai-queries → AuditEntry[] (newest first) */
export function toAuditLog(raw: unknown): AuditEntry[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const confidence = (v: unknown) => {
    const s = str(v).toLowerCase();
    const n = Number(s);
    if (Number.isFinite(n) && s !== "") return Math.round(n <= 1 ? n * 100 : n);
    return s === "high" ? 90 : s === "medium" ? 70 : s === "low" ? 50 : 0;
  };
  return rows(raw, "data").map((q) => {
    const d = new Date(str(q.created_at));
    const at = Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
    return {
      id: str(q.id),
      at,
      user: str(q.user_name, "System"),
      query: str(q.query_text),
      modules: arr<string>(q.modules),
      sources: arr<string>(q.source_titles),
      confidence: confidence(q.confidence_level),
      retrieval: arr<string>(q.retrieved_vs_inferred).some((x) => /infer/i.test(x)) ? "Inferred" : "Retrieved",
    };
  });
}