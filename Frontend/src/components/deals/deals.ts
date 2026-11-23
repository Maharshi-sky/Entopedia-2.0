import type { BadgeTone } from "@/components/ui/Badge";
import type { Deal, DealType } from "@/data/deals";

// Deal data lives in the store (src/data/deals.ts); this file holds how deals
// look and the date/period helpers.
export { dealTypes, segments, type Deal, type DealType, type InvestorProfile, type Segment } from "@/data/deals";

// Every type has a fixed colour and is always shown with its label, never colour alone.
export const typeStyle: Record<DealType, { tone: BadgeTone; color: string }> = {
  Funding: { tone: "green", color: "#004736" },
  Acquisition: { tone: "amber", color: "#d97706" },
  Investment: { tone: "indigo", color: "#4f46e5" },
  IPO: { tone: "purple", color: "#9333ea" },
};

// Figures are "as of" this date rather than the viewer's clock, so the page
// renders the same on the server and in the browser.
export const AS_OF = "2026-10-28";

export const periods = ["7D", "30D", "90D", "YTD"] as const;
export type Period = (typeof periods)[number];

const DAY = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const asOf = toTime(AS_OF);

// The selected window, up to and including AS_OF.
export function windows(period: Period) {
  const start =
    period === "YTD"
      ? toTime(`${AS_OF.slice(0, 4)}-01-01`)
      : asOf - (Number(period.replace("D", "")) - 1) * DAY;
  return { current: { start, end: asOf + DAY } };
}

export function inWindow(deal: Deal, w: { start: number; end: number }) {
  const t = toTime(deal.date);
  return t >= w.start && t < w.end;
}

export const disclosed = (list: Deal[]) =>
  list.reduce((sum, d) => sum + (d.amount ?? 0), 0);

export function money(millions: number) {
  return millions >= 1000 ? `$${(millions / 1000).toFixed(1)}B` : `$${Math.round(millions)}M`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Formatted by hand: toLocaleDateString can differ between the server's Node and
// the browser (e.g. "Sep" vs "Sept"), which breaks hydration.
export function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
