// Competitor Intelligence: overview panels, patents, research papers, products.

export type Provenance = {
  sources: string[];
  confidence: number;
  status: "Retrieved" | "Inferred";
};

// API resource: GET /competitor-profiles → CompetitorProfile[]
export type CompetitorProfile = {
  name: string;
  patents: number;
  activeFilings: number;
  // null when the source has no figure (the API does not track SKUs or launches yet).
  skus: number | null;
  launches: number | null;
  footprint: string;
  provenance: Provenance;
};

export const competitorProfiles: CompetitorProfile[] = [
  {
    name: "Godrej Good Knight",
    patents: 24,
    activeFilings: 7,
    skus: 18,
    launches: 3,
    footprint: "IN, NG, BD, LK",
    provenance: { sources: ["Nielsen India", "IP India", "CIB&RC"], confidence: 87, status: "Retrieved" },
  },
  {
    name: "SC Johnson",
    patents: 41,
    activeFilings: 12,
    skus: 33,
    launches: 5,
    footprint: "US, BR, IN, ID",
    provenance: { sources: ["USPTO", "ANVISA", "Nielsen India"], confidence: 82, status: "Retrieved" },
  },
  {
    name: "Bayer",
    patents: 58,
    activeFilings: 15,
    skus: 26,
    launches: 2,
    footprint: "DE, US, BR, IN",
    provenance: { sources: ["EPO", "USPTO", "EPA"], confidence: 90, status: "Retrieved" },
  },
  {
    name: "Jyothy Labs (Maxo)",
    patents: 9,
    activeFilings: 3,
    skus: 14,
    launches: 4,
    footprint: "IN, LK",
    provenance: { sources: ["IP India", "CIB&RC"], confidence: 78, status: "Retrieved" },
  },
];

// API resource: GET /launch-signals → LaunchSignal[]
export type LaunchSignal = { title: string; detail: string; evidence: string[] };

export const launchSignals: LaunchSignal[] = [
  {
    title: "Godrej likely move into transfluthrin-free LV",
    detail:
      "5 filings clustered on transfluthrin-free actives, last 14 months · 1 CIB&RC registration · format-gap vs current range",
    evidence: [
      "IP India: 5 applications citing non-transfluthrin LV formulations",
      "CIB&RC: provisional registration for meperfluthrin LV",
    ],
  },
  {
    title: "SC Johnson aerosol line extension, Brazil",
    detail: "3 ANVISA filings, last 2 quarters · matches existing aerosol portfolio",
    evidence: [
      "ANVISA: 3 aerosol registrations under the same brand family",
      "Product library: existing aerosol SKUs share the active",
    ],
  },
  {
    title: "Jyothy Maxo low-cost coil SKU for rural India",
    detail: "2 patents on cost-reduced formulation · price-tier gap in current range",
    evidence: [
      "IP India: 2 patents on reduced-active coil substrate",
      "Nielsen India: no Maxo coil SKU below the entry price tier",
    ],
  },
];

// API resource: GET /strategic-filings → StrategicFiling[]
export type StrategicFiling = { company: string; detail: string };

export const strategicFilings: StrategicFiling[] = [
  { company: "Good Knight", detail: "Pre-launch CIB&RC LV meperfluthrin" },
  { company: "SC Johnson", detail: "ANVISA aerosol registration" },
  { company: "Bayer", detail: "EPA Flupyradifurone LV" },
];

// API resource: GET /white-space → WhiteSpace
// "claimed" = a competitor already holds it, "none" = no activity, "open" = unclaimed opportunity.
export type WhiteSpaceCell = "claimed" | "none" | "open";
export type WhiteSpace = { formats: string[]; actives: { name: string; cells: WhiteSpaceCell[] }[] };

export const whiteSpace: WhiteSpace = {
  formats: ["Coil", "LV", "Aerosol", "Mat"],
  actives: [
    { name: "Transfluthrin", cells: ["claimed", "claimed", "claimed", "none"] },
    { name: "Prallethrin", cells: ["none", "claimed", "none", "claimed"] },
    { name: "Meperfluthrin", cells: ["claimed", "none", "open", "claimed"] },
    { name: "Neem extract", cells: ["open", "open", "none", "claimed"] },
  ],
};

// API resource: GET /patents → Patent[]
export type Patent = {
  number: string;
  assignee: string;
  active: string;
  technology: string;
  filed: string;
  status: "Pending" | "Granted";
  maturity: number;
};

export const patents: Patent[] = [
  { number: "WO2025/123456", assignee: "Godrej Consumer", active: "Meperfluthrin", technology: "Microencapsulation", filed: "2025-03-12", status: "Pending", maturity: 82 },
  { number: "IN4582930", assignee: "SC Johnson", active: "Prallethrin", technology: "Controlled release", filed: "2024-11-05", status: "Granted", maturity: 91 },
  { number: "US11,234,567", assignee: "Bayer", active: "Flupyradifurone", technology: "Electrostatic spray", filed: "2024-07-22", status: "Granted", maturity: 76 },
  { number: "EP3987214", assignee: "Reckitt Benckiser", active: "Transfluthrin", technology: "Passive dispenser", filed: "2025-01-18", status: "Pending", maturity: 68 },
  { number: "AU2025/50193", assignee: "Jyothy Labs", active: "D-Allethrin", technology: "Smokeless coil", filed: "2025-05-30", status: "Pending", maturity: 55 },
];

// API resource: GET /papers → Paper[]
export type Paper = {
  title: string;
  journal: string;
  year: number;
  summary: string;
  insight: string;
  theme: string;
  confidence: number;
};

export const papers: Paper[] = [
  {
    title: "Pyrethroid resistance in Aedes aegypti India sentinel surveillance",
    journal: "Parasites & Vectors",
    year: 2026,
    summary:
      "Resistance to transfluthrin detected in 4/6 Indian districts. Knockdown resistance (kdr) allele frequency 0.42. Implication: LV efficacy window narrowing.",
    insight: "Switch actives in high-resistance geographies. Prallethrin still efficacious.",
    theme: "Resistance mitigation",
    confidence: 92,
  },
  {
    title: "Nootkatone as a mosquito repellent: 8-hour field validation",
    journal: "J. Med. Entomol.",
    year: 2024,
    summary:
      "Nootkatone 5% matched DEET 20% in 8-hr field protection. Low mammalian toxicity. EPA-registered 2023.",
    insight: "First GRAS-status active with strong consumer story. Licensing window open.",
    theme: "Nootkatone licensing",
    confidence: 92,
  },
  {
    title: "Electrostatic aerosol delivery: 3× coverage vs. conventional",
    journal: "Pest Manag. Sci.",
    year: 2025,
    summary:
      "Electrostatic charged aerosol particles wrap around surfaces — 3× coverage at same active loading. 40% cost reduction on active.",
    insight: "Bayer has filed patent US11,234,567. Device-layer innovation, not active.",
    theme: "Electrostatic device watch",
    confidence: 89,
  },
];

// API resource: GET /products → Product[]
export type Product = {
  id: string;
  brand: string;
  name: string;
  active: string;
  format: string;
  claims: string[];
  price: number;
  // Image URL or a path under /public; a placeholder shows until set.
  image?: string;
};

export const products: Product[] = [
  { id: "gk-lv", brand: "Good Knight", name: "LV 45N Refill", active: "Prallethrin 0.1%", format: "LV", claims: ["8-hr protection", "No smoke", "Kills dengue mosquitoes"], price: 89, image: "/pl5.jpg" },
  { id: "mortein-lv", brand: "Mortein", name: "LV 45N Refill", active: "Transfluthrin 0.04%", format: "LV", claims: ["8-hr protection", "Fragrance-free", "99.9% knockdown"], price: 95, image: "/pl1.jpg" },
  { id: "allout-lv", brand: "All Out", name: "LV Ultra Refill", active: "D-Allethrin 0.2%", format: "LV", claims: ["12-hr protection", "No smell"], price: 79, image: "/pl4.jpg" },
  { id: "gk-card", brand: "Good Knight", name: "Fast Card", active: "Meperfluthrin 0.03%", format: "Card", claims: ["1 card = 1 coil", "No smoke", "12-hr"], price: 59, image: "/pl2.jpg" },
  { id: "maxo-coil", brand: "Maxo", name: "Silver Coil", active: "D-Allethrin 0.2%", format: "Coil", claims: ["8-hr burn time", "Low smoke"], price: 35, image: "/pl6.jpg" },
  { id: "hit-spray", brand: "HIT", name: "Spray Crawling", active: "Cypermethrin 0.3%", format: "Aerosol", claims: ["Instant kill", "Residual 4-hr", "Roach specialist"], price: 145, image: "/pl3.jpg" },
];
