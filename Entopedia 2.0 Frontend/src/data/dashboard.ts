// Dashboard widgets. Everything here is plain JSON so it can come straight
// from an API; icons are named, and the component maps names to icons.

// API resource: GET /dashboard-metrics → Metric[]
export type Metric = {
  id: string;
  title: string;
  value: string;
  caption: string;
  icon: "alert" | "claims" | "news" | "launches";
  tone: "alert" | "brand";
  trend: number[];
};

export const metrics: Metric[] = [
  {
    id: "alerts",
    title: "High-priority alerts",
    value: "47",
    caption: "3 regulatory · 2 competitor · 1 pest outbreak",
    icon: "alert",
    tone: "alert",
    trend: [4, 6, 5, 7, 5, 8, 6, 9, 8, 12],
  },
  {
    id: "claims",
    title: "New claims identified",
    value: "38",
    caption: "Top category: Residue-free (+18)",
    icon: "claims",
    tone: "brand",
    trend: [3, 5, 4, 6, 5, 7, 6, 7, 8, 9],
  },
  {
    id: "news",
    title: "News intelligence",
    value: "1,284",
    caption: "84 flagged relevant",
    icon: "news",
    tone: "brand",
    trend: [2, 3, 4, 5, 5, 6, 7, 8, 9, 10],
  },
  {
    id: "launches",
    title: "New competitor launches",
    value: "24",
    caption: "vs 21 last week",
    icon: "launches",
    tone: "brand",
    trend: [5, 7, 4, 8, 3, 7, 5, 6, 8, 9],
  },
];

// API resource: GET /competitor-momentum → Momentum
export type Momentum = {
  months: string[];
  // Listed in clockwise donut order, starting at ten o'clock. One value per month.
  competitors: { name: string; short: string; color: string; monthly: number[] }[];
  legendOrder: string[];
};

export const momentum: Momentum = {
  months: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  competitors: [
    { name: "Bayer", short: "BY", color: "#004736", monthly: [1, 2, 2, 1, 2, 2] },
    { name: "Corteva", short: "CO", color: "#e8572f", monthly: [1, 1, 2, 1, 1, 1] },
    { name: "BASF", short: "BA", color: "#4f56d6", monthly: [1, 1, 1, 1, 1, 1] },
    { name: "Syngenta", short: "SY", color: "#d98b0b", monthly: [2, 1, 2, 2, 2, 2] },
  ],
  legendOrder: ["Bayer", "Syngenta", "BASF", "Corteva"],
};

// API resource: GET /news-flow → NewsFlow
export type NewsFlowSeries = { label: string; color: string; data: number[] };
export type NewsFlow = { months: string[]; series: NewsFlowSeries[] };

export const newsFlow: NewsFlow = {
  months: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  // Ordered to match the legend grid (row by row).
  series: [
    { label: "Regulatory", color: "#0f6b55", data: [45, 52, 60, 48, 75, 108] },
    { label: "Industry", color: "#e8a317", data: [33, 38, 44, 50, 53, 58] },
    { label: "Technology", color: "#4f56d6", data: [22, 25, 28, 32, 36, 40] },
    { label: "Product", color: "#e8572f", data: [28, 30, 34, 38, 41, 45] },
    { label: "Science", color: "#9b59b6", data: [18, 20, 23, 25, 28, 31] },
    { label: "Safety", color: "#3b82f6", data: [14, 16, 19, 21, 23, 26] },
    { label: "Disease", color: "#6aa84f", data: [30, 34, 40, 44, 50, 55] },
    { label: "Interviews", color: "#c0399a", data: [10, 11, 13, 14, 16, 18] },
    { label: "People & Company", color: "#9ca3af", data: [16, 19, 21, 24, 26, 29] },
  ],
};

// API resource: GET /signals → Signal[]
export type Signal = {
  tag: string;
  time: string;
  title: string;
  kind: "alert" | "signal";
  badge: "red" | "green" | "amber" | "indigo" | "purple" | "orange" | "gray";
};

export const signals: Signal[] = [
  { tag: "Regulatory", time: "1h ago", title: "EU BPR issued new restriction on pyrethroid sprays", kind: "alert", badge: "red" },
  { tag: "Market", time: "2h ago", title: "Bayer launched IoT bait system in Brazil", kind: "signal", badge: "green" },
  { tag: "Pest Vision", time: "3h ago", title: "Aedes aegypti outbreak flagged — APAC, 94.2% confidence", kind: "alert", badge: "amber" },
  { tag: "Claims", time: "5h ago", title: "Claim Studio: 42 claims generated for Smart Repellent", kind: "signal", badge: "indigo" },
];
