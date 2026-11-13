"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Download, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  AS_OF,
  dealTypes,
  disclosed,
  formatDate,
  inWindow,
  money,
  periods,
  typeStyle,
  windows,
  type Deal,
  type InvestorProfile,
  type Period,
} from "./deals";

// Deal cards shown per tab before "See all".
const VISIBLE = 6;
const TOP_INVESTORS = 5;

const periodLabel: Record<Period, string> = {
  "7D": "last 7 days",
  "30D": "last 30 days",
  "90D": "last 90 days",
  YTD: "year to date",
};

const tabs = ["All", ...dealTypes] as const;
type Tab = (typeof tabs)[number];

const tabLabel: Record<Tab, string> = {
  All: "All deals",
  Funding: "Funding rounds",
  Acquisition: "Acquisitions",
  Investment: "Investments",
  IPO: "IPOs",
};

// Financial backers only: acquirers and IPOs don't count as investor activity.
const backed = (list: Deal[], name: string) =>
  list.filter(
    (d) => (d.type === "Funding" || d.type === "Investment") && d.investors.includes(name),
  );

function countOf<T>(items: T[]) {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

const amountText = (deal: Deal) => (deal.amount === null ? "Undisclosed" : money(deal.amount));

function listInsight(tab: Tab, items: Deal[], period: Period) {
  const noun = tabLabel[tab].toLowerCase();
  if (items.length === 0) return `No ${noun} in the ${periodLabel[period]}.`;
  const value = disclosed(items);
  const largest = items.slice().sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
  const undisclosed = items.filter((d) => d.amount === null).length;
  const head =
    value === 0
      ? `${items.length} ${noun} in the ${periodLabel[period]}, all with undisclosed value.`
      : `${items.length} ${noun} worth ${money(value)} in the ${periodLabel[period]}.`;
  const tail = [
    value > 0 && largest.amount && `Largest: ${largest.company} at ${money(largest.amount)}.`,
    undisclosed > 0 && value > 0 && `${undisclosed} undisclosed.`,
  ]
    .filter(Boolean)
    .join(" ");
  return tail ? `${head} ${tail}` : head;
}

function InvestorDrawer({
  profile,
  deals,
  onClose,
}: {
  profile: InvestorProfile;
  deals: Deal[];
  onClose: () => void;
}) {
  const { name } = profile;
  const portfolio = deals.filter((d) => d.investors.includes(name));
  const focus = countOf(portfolio.map((d) => d.segment))[0]?.[0];
  const stages = [...new Set(portfolio.map((d) => d.stage))].join(", ");
  const coInvestors = countOf(portfolio.flatMap((d) => d.investors.filter((i) => i !== name)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden onClick={onClose} className="chart-fade absolute inset-0 bg-black/30" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.name} profile`}
        className="drawer-in relative flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-md"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-brand-soft text-[0.8125rem] font-bold text-brand">
              {profile.initials}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">{profile.name}</h2>
              <p className="text-xs text-gray-500">{profile.kind}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close profile"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-[0.9375rem] text-ink">
            {portfolio.length === 0
              ? `${profile.name} has no tracked deals in the last 12 months.`
              : `${profile.name} was in ${portfolio.length} ${portfolio.length === 1 ? "deal" : "deals"} over the last 12 months${focus ? `, mostly in ${focus}` : ""}.`}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            {[
              ["Deals (12 mo)", String(portfolio.length)],
              ["In deals worth", money(disclosed(portfolio))],
              ["Focus", focus ?? "—"],
              ["Stages", stages || "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-[#fafbfa] px-3 py-2.5">
                <dt className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">{k}</dt>
                <dd className="mt-0.5 truncate text-[0.9375rem] font-semibold text-ink tabular-nums" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          {portfolio.length > 0 && (
            <>
              <h3 className="mt-6 text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
                Portfolio
              </h3>
              <ol className="mt-2">
                {portfolio.map((d, i) => (
                  <li key={d.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < portfolio.length - 1 && (
                      <span aria-hidden className="absolute top-4 bottom-0 left-[0.3125rem] w-px bg-line" />
                    )}
                    <span
                      aria-hidden
                      className="relative mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: typeStyle[d.type].color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[0.8125rem] text-gray-500 tabular-nums">{formatDate(d.date)}</span>
                        <Badge tone={typeStyle[d.type].tone} size="sm">{d.type}</Badge>
                      </div>
                      <p className="mt-0.5 text-[0.9375rem] text-ink">{d.headline}</p>
                      <p className="text-[0.8125rem] text-gray-500">Source: {d.source}</p>
                    </div>
                    <span className="shrink-0 text-[0.875rem] font-semibold text-ink tabular-nums">
                      {amountText(d)}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {coInvestors.length > 0 && (
            <>
              <h3 className="mt-6 text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
                Co-investors
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {coInvestors.map(([n, c]) => (
                  <span key={n} className="rounded-md border border-line bg-[#f5f6f5] px-2 py-1 text-[0.8125rem] text-ink">
                    {n} <span className="text-gray-500 tabular-nums">×{c}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function InvestorCard({
  initials,
  name,
  kind,
  view,
  active,
  onOpen,
}: {
  initials: string;
  name: string;
  kind: string;
  view: Deal[];
  active: boolean;
  onOpen: () => void;
}) {
  const own = backed(view, name);
  const focus = countOf(own.map((d) => d.segment))[0]?.[0];

  return (
    <Card className={`flex flex-col ${active ? "ring-2 ring-brand" : ""}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-[0.8125rem] font-bold text-brand">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-semibold text-ink">{name}</p>
          <p className="truncate text-[0.8125rem] text-gray-500">{kind}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
        <div>
          <dt className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">Deals</dt>
          <dd className="font-heading text-lg font-semibold text-ink tabular-nums">{own.length}</dd>
        </div>
        <div>
          <dt className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">Value</dt>
          <dd className="font-heading text-lg font-semibold text-ink tabular-nums">
            {own.length ? money(disclosed(own)) : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-1 truncate text-[0.8125rem] text-gray-500">
        {focus ? `Focus: ${focus}` : "No deals in this period"}
      </p>

      <button
        type="button"
        aria-pressed={active}
        onClick={onOpen}
        className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-brand-soft px-3 py-2 text-[0.8125rem] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
      >
        Activities
        <ArrowUpRight className="size-3.5" />
      </button>
    </Card>
  );
}

function DealCard({
  deal,
  index,
  profiled,
  onInvestor,
}: {
  deal: Deal;
  index: number;
  // Investors with a profile; their names link to the drawer.
  profiled: Set<string>;
  onInvestor: (name: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `${deal.headline} (${formatDate(deal.date)}; ${amountText(deal).toLowerCase()}). Source: ${deal.source}.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the button simply doesn't confirm.
    }
  }

  return (
    <article
      className="chart-fade flex flex-col rounded-xl border border-line bg-white p-4 transition-colors hover:border-brand/30"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={typeStyle[deal.type].tone} size="sm">{deal.type}</Badge>
          <span className="text-[0.8125rem] text-gray-500 tabular-nums">{formatDate(deal.date)}</span>
        </div>
        <span
          className={`shrink-0 font-heading font-semibold tabular-nums ${
            deal.amount === null ? "text-[0.875rem] text-gray-500" : "text-lg text-ink"
          }`}
        >
          {amountText(deal)}
        </span>
      </div>

      <h3 className="mt-2 text-[0.9375rem] leading-snug font-semibold text-ink">{deal.headline}</h3>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[deal.stage, deal.segment, deal.region].map((tag) => (
          <span key={tag} className="rounded-md bg-[#f5f6f5] px-2 py-0.5 text-[0.8125rem] text-gray-600">
            {tag}
          </span>
        ))}
      </div>

      {deal.investors.length > 0 && (
        <p className="mt-3 text-[0.8125rem] text-gray-500">
          {deal.type === "Acquisition" ? "Acquirer" : "Investors"}:{" "}
          {deal.investors.map((name, i) => (
            <span key={name}>
              {i > 0 && ", "}
              {profiled.has(name) ? (
                <button
                  type="button"
                  onClick={() => onInvestor(name)}
                  className="font-semibold text-brand hover:underline"
                >
                  {name}
                </button>
              ) : (
                <span className="font-semibold text-ink">{name}</span>
              )}
            </span>
          ))}
        </p>
      )}

      {/* Pins the footer to the bottom so cards in a row line up. */}
      <div aria-hidden className="min-h-3 flex-1" />
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="truncate text-[0.8125rem] text-gray-500">Source: {deal.source}</span>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-gray-50"
        >
          {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy summary"}
        </button>
      </div>
    </article>
  );
}

function DealBrowser({
  view,
  period,
  profiled,
  onInvestor,
}: {
  view: Deal[];
  period: Period;
  profiled: Set<string>;
  onInvestor: (name: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("All");
  const [expanded, setExpanded] = useState(false);
  const items = tab === "All" ? view : view.filter((d) => d.type === tab);
  const shown = expanded ? items : items.slice(0, VISIBLE);

  function choose(next: Tab) {
    setTab(next);
    setExpanded(false);
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">Deals</h2>
        <p className="mt-0.5 text-xs text-gray-600">{listInsight(tab, items, period)}</p>
      </div>

      <div
        role="tablist"
        aria-label="Deal type"
        className="scrollbar-none flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1.5"
      >
        {tabs.map((t) => {
          const count = t === "All" ? view.length : view.filter((d) => d.type === t).length;
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => choose(t)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[0.9375rem] transition-colors ${
                active ? "bg-brand font-semibold text-white" : "text-gray-600 hover:text-ink"
              }`}
            >
              {t !== "All" && (
                <span
                  aria-hidden
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: active ? "#fff" : typeStyle[t].color }}
                />
              )}
              {tabLabel[t]}
              <span
                className={`rounded-md px-1.5 text-[0.8125rem] tabular-nums ${
                  active ? "bg-white/20" : "bg-[#f1f3f2] text-gray-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white py-12 text-center text-[0.9375rem] text-gray-500">
          No {tabLabel[tab].toLowerCase()} in the {periodLabel[period]}. Try a longer period.
        </p>
      ) : (
        <div key={`${tab}-${period}`} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((d, i) => (
            <DealCard key={d.id} deal={d} index={i} profiled={profiled} onInvestor={onInvestor} />
          ))}
        </div>
      )}

      {items.length > VISIBLE && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-line bg-white px-4 py-2 text-[0.875rem] font-semibold text-brand transition-colors hover:bg-gray-50"
          >
            {expanded ? "Show less" : `See all ${items.length}`}
          </button>
        </div>
      )}
    </section>
  );
}

function Timeline({ items }: { items: Deal[] }) {
  return (
    <Card>
      <h2 className="text-[1.0625rem] font-semibold text-ink">Deal timeline</h2>
      <p className="mt-1 text-xs text-gray-600">
        {items.length ? `${items.length} dated events, newest first.` : "No deals in this view."}
      </p>
      {items.length > 0 && (
        <ol className="mt-4 max-h-[28rem] overflow-y-auto pr-1">
          {items.map((d, i) => (
            <li key={d.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/* Connector line down to the next event. */}
              {i < items.length - 1 && (
                <span aria-hidden className="absolute top-4 bottom-0 left-[0.3125rem] w-px bg-line" />
              )}
              <span
                aria-hidden
                className="relative mt-1.5 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: typeStyle[d.type].color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.8125rem] font-semibold text-gray-500 tabular-nums">{formatDate(d.date)}</span>
                  <Badge tone={typeStyle[d.type].tone} size="sm">{d.type}</Badge>
                </div>
                <p className="mt-0.5 text-[0.9375rem] text-ink">{d.headline}</p>
              </div>
              <span className="shrink-0 text-[0.875rem] font-semibold text-ink tabular-nums">
                {d.amount === null ? "—" : money(d.amount)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function DealsOverview({
  deals,
  investors: investorProfiles,
}: {
  deals: Deal[];
  investors: InvestorProfile[];
}) {
  const profiled = new Set(investorProfiles.map((p) => p.name));
  const [period, setPeriod] = useState<Period>("90D");
  const [selected, setSelected] = useState<string | null>(null);
  const [allInvestors, setAllInvestors] = useState(false);

  const view = deals.filter((d) => inWindow(d, windows(period).current));
  const selectedProfile = investorProfiles.find((p) => p.name === selected);

  const rankedInvestors = investorProfiles
    .map((p) => ({ ...p, count: backed(view, p.name).length }))
    .sort((a, b) => b.count - a.count);
  const investorsShown = allInvestors ? rankedInvestors : rankedInvestors.slice(0, TOP_INVESTORS);
  const leaders = rankedInvestors.filter((i) => i.count > 0 && i.count === rankedInvestors[0].count);
  const investorInsight =
    leaders.length === 0
      ? `No financial investor backed a tracked deal in the ${periodLabel[period]}.`
      : `${leaders.map((l) => l.name).join(leaders.length === 2 ? " and " : ", ")} ${
          leaders.length === 1 ? "led" : "led jointly"
        } in the ${periodLabel[period]} with ${leaders[0].count} ${leaders[0].count === 1 ? "deal" : "deals"}${
          leaders.length > 1 ? " each" : ""
        }.`;

  function exportCsv() {
    downloadCsv(
      `deals-${period.toLowerCase()}.csv`,
      toCsv([
        ["Date", "Type", "Company", "Headline", "Amount (US$M)", "Stage", "Segment", "Investors / acquirer", "Region", "Source"],
        ...view.map((d) => [d.date, d.type, d.company, d.headline, d.amount ?? "Undisclosed", d.stage, d.segment, d.investors.join("; "), d.region, d.source]),
      ]),
    );
  }

  return (
    <>
      
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Top Investors</h2>
            <p className="mt-0.5 text-xs text-gray-600">{investorInsight}</p>
          </div>
          <button
            type="button"
            onClick={() => setAllInvestors((v) => !v)}
            className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand/90"
          >
            {allInvestors ? "Show top 5" : "View all"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {investorsShown.map((i) => (
            <InvestorCard
              key={i.name}
              {...i}
              view={view}
              active={selected === i.name}
              onOpen={() => setSelected(i.name)}
            />
          ))}
        </div>
      </section>

      <DealBrowser view={view} period={period} profiled={profiled} onInvestor={setSelected} />

      <Timeline items={view} />

      {selectedProfile && (
        <InvestorDrawer
          key={selectedProfile.name}
          profile={selectedProfile}
          deals={deals}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
