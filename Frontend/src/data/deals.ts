// Deals & Investments: funding rounds, acquisitions, investments, IPOs.
// API resources: GET /deals → Deal[], GET /investors → InvestorProfile[]

export const dealTypes = ["Funding", "Acquisition", "Investment", "IPO"] as const;
export type DealType = (typeof dealTypes)[number];

export const segments = ["Biologicals", "Devices & IoT", "Formulation", "Digital & AI"] as const;
export type Segment = (typeof segments)[number];

export type Deal = {
  id: string;
  date: string; // YYYY-MM-DD
  type: DealType;
  company: string;
  headline: string;
  // US$ millions; null when undisclosed.
  amount: number | null;
  stage: string;
  segment: Segment;
  investors: string[];
  region: string;
  source: string;
};

export const deals: Deal[] = [
  { id: "d1", date: "2026-10-22", type: "Funding", company: "VectorWatch", headline: "VectorWatch raises $5M seed for AI mosquito-density forecasting", amount: 5, stage: "Seed", segment: "Digital & AI", investors: ["Accel Partners"], region: "Singapore", source: "DealStreetAsia" },
  { id: "d2", date: "2026-10-14", type: "Funding", company: "BASF Ventures spin-off", headline: "BASF spin-off closes $45M Series B led by Tiger Global", amount: 45, stage: "Series B", segment: "Biologicals", investors: ["Tiger Global", "BASF Ventures"], region: "Germany", source: "TechCrunch" },
  { id: "d3", date: "2026-10-09", type: "IPO", company: "PestTech Global", headline: "PestTech Global files for NYSE listing, targeting $220M", amount: 220, stage: "Filed", segment: "Devices & IoT", investors: [], region: "United States", source: "SEC EDGAR" },
  { id: "d4", date: "2026-10-03", type: "Investment", company: "NeemTech", headline: "Godrej Consumer takes 20% stake in NeemTech", amount: 9, stage: "Strategic stake", segment: "Biologicals", investors: ["Godrej Consumer"], region: "India", source: "Economic Times" },
  { id: "d5", date: "2026-09-22", type: "Funding", company: "BioZect Inc.", headline: "BioZect raises $12M seed for RNAi mosquito control", amount: 12, stage: "Seed", segment: "Biologicals", investors: ["Sequoia Capital"], region: "United States", source: "Crunchbase" },
  { id: "d6", date: "2026-09-15", type: "Funding", company: "MosquiDx", headline: "MosquiDx raises $14M Series A for outbreak diagnostics", amount: 14, stage: "Series A", segment: "Digital & AI", investors: ["SoftBank", "DST Global"], region: "Japan", source: "Nikkei Asia" },
  { id: "d7", date: "2026-09-05", type: "Acquisition", company: "SmartPest IoT", headline: "Bayer acquires SmartPest IoT division", amount: null, stage: "Carve-out", segment: "Devices & IoT", investors: ["Bayer"], region: "Germany", source: "Reuters" },
  { id: "d8", date: "2026-08-30", type: "Funding", company: "AgriSense", headline: "AgriSense raises $8M Series A for smart trap network", amount: 8, stage: "Series A", segment: "Devices & IoT", investors: ["Accel Partners", "SoftBank"], region: "India", source: "YourStory" },
  { id: "d9", date: "2026-08-12", type: "IPO", company: "BioControl Inc", headline: "BioControl Inc goes public in London, raising $140M", amount: 140, stage: "Listed", segment: "Biologicals", investors: [], region: "United Kingdom", source: "Financial Times" },
  { id: "d10", date: "2026-07-28", type: "Acquisition", company: "EcoLure", headline: "Syngenta buys out EcoLure formulations for $60M", amount: 60, stage: "Full buyout", segment: "Formulation", investors: ["Syngenta"], region: "Switzerland", source: "AgroPages" },
  { id: "d11", date: "2026-07-18", type: "Investment", company: "SenseTrap AI", headline: "SoftBank invests $25M in SenseTrap AI", amount: 25, stage: "Growth", segment: "Digital & AI", investors: ["SoftBank"], region: "Japan", source: "Bloomberg" },
  { id: "d12", date: "2026-06-11", type: "Investment", company: "SkySpray", headline: "Sequoia backs drone-spraying startup SkySpray with $18M", amount: 18, stage: "Series A", segment: "Devices & IoT", investors: ["Sequoia Capital", "DST Global"], region: "India", source: "Economic Times" },
  { id: "d13", date: "2026-05-09", type: "Investment", company: "HomeGuard Labs", headline: "DST Global puts $15M into HomeGuard Labs", amount: 15, stage: "Growth", segment: "Formulation", investors: ["DST Global"], region: "UAE", source: "Gulf News" },
  { id: "d14", date: "2026-04-15", type: "Acquisition", company: "PicaGuard", headline: "SC Johnson acquires PicaGuard repellents for $110M", amount: 110, stage: "Full buyout", segment: "Formulation", investors: ["SC Johnson"], region: "United States", source: "Reuters" },
  { id: "d15", date: "2026-03-10", type: "Funding", company: "LarvaLens", headline: "LarvaLens raises $6M seed for larval-site imaging", amount: 6, stage: "Seed", segment: "Digital & AI", investors: ["Sequoia Capital"], region: "Brazil", source: "LAVCA" },
  { id: "d16", date: "2026-02-14", type: "Funding", company: "Citronix", headline: "Citronix raises $10M Series A for botanical actives", amount: 10, stage: "Series A", segment: "Biologicals", investors: ["Tiger Global"], region: "India", source: "VCCircle" },
  { id: "d17", date: "2026-01-20", type: "Acquisition", company: "BioRepel Vietnam", headline: "Sumitomo Chemical acquires BioRepel Vietnam for $22M", amount: 22, stage: "Full buyout", segment: "Biologicals", investors: ["Sumitomo Chemical"], region: "Vietnam", source: "Nikkei Asia" },
  { id: "d18", date: "2025-12-02", type: "IPO", company: "AgroNova", headline: "AgroNova lists on NSE, raising $65M", amount: 65, stage: "Listed", segment: "Formulation", investors: [], region: "India", source: "Mint" },
  { id: "d19", date: "2025-11-18", type: "Funding", company: "TrapIQ", headline: "TrapIQ raises $4M seed for connected glue traps", amount: 4, stage: "Seed", segment: "Devices & IoT", investors: ["Accel Partners"], region: "India", source: "Inc42" },
];

// Financial investors profiled under Top Investors (acquirers and strategics excluded).
export type InvestorProfile = { name: string; initials: string; kind: string };

export const investorProfiles: InvestorProfile[] = [
  { name: "Sequoia Capital", initials: "SQ", kind: "Venture capital" },
  { name: "DST Global", initials: "DST", kind: "Growth equity" },
  { name: "Accel Partners", initials: "ACC", kind: "Venture capital" },
  { name: "SoftBank", initials: "SB", kind: "Growth equity" },
  { name: "Tiger Global", initials: "TG", kind: "Growth equity" },
  { name: "BASF Ventures", initials: "BV", kind: "Corporate venture" },
];
