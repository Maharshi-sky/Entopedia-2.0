// News items: dashboard Recent News, the News page, Newsletter Studio and Deliverables.
// API resource: GET /news → Article[]

export type Category =
  | "Industry"
  | "Science"
  | "Technology"
  | "Product"
  | "Regulatory"
  | "Safety"
  | "Disease"
  | "Interviews"
  | "People & Company";

export type CategoryFilter = "All News" | Category;

export const categories: CategoryFilter[] = [
  "All News",
  "Industry",
  "Science",
  "Technology",
  "Product",
  "Regulatory",
  "Safety",
  "Disease",
  "Interviews",
  "People & Company",
];

export type Article = {
  title: string;
  summary: string;
  category: Category;
  source: string;
  time: string;
  // Path under /public (e.g. "/news/bayer.jpg") or the publisher's picture
  // (an https URL); a placeholder shows until set.
  image?: string;
  // API stories only:
  id?: string;
  // The publisher's page, opened by "Read article".
  url?: string;
  // Brand-news stories (Google News): the tracked brand, and whether the
  // story is about the brand or only related to it.
  brand?: string;
  kind?: NewsKind;
  // Every brand the same headline was saved for, the brand it is about first.
  brands?: { name: string; kind: NewsKind }[];
  // The same event reported by other outlets (shown once, with these as extra links).
  moreSources?: { source: string; url?: string }[];
};

/** about the brand · its product category · its company (results, leadership; shown only on request) */
export type NewsKind = "brand" | "related" | "company";

// Newest first.
export const articles: Article[] = [
  {
    title: "Strategic Shift: APAC Vectors Face New AI-Driven Mitigation",
    summary:
      "New predictive models analyze shifting habitats to optimize control strategy across the region.",
    category: "Technology",
    source: "Entopedia Intelligence",
    time: "2 hours ago",
    image: "/main.jpg",
  },
  {
    title: "Bayer launches new biological repellent",
    summary:
      "A new plant-derived active ingredient targets resistant mosquito strains with low environmental impact.",
    category: "Product",
    source: "MarketWatch",
    time: "5 hours ago",
    image: "/nr1.jpg",
  },
  {
    title: "AI models predict malaria spread in APAC",
    summary:
      "Using historical weather data and IoT sensors to forecast outbreak zones before mosquito populations peak.",
    category: "Science",
    source: "ScienceDaily",
    time: "1 day ago",
    image: "/nr2.jpg",
  },
  {
    title: "Syngenta expands R&D facility in Singapore",
    summary:
      "Focusing on tropical pest resilience and biopesticide formulation for APAC markets.",
    category: "People & Company",
    source: "Reuters",
    time: "2 days ago",
    image: "/nr3.jpg",
  },
  {
    title: 'New startup "BioGuard" enters seed stage',
    summary:
      "Pheromone-based traps targeting urban cockroach populations raise $4M in pre-seed funding.",
    category: "Industry",
    source: "TechCrunch",
    time: "3 days ago",
    image: "/nr4.jpg",
  },
  {
    title: "EU BPR restricts pyrethroid indoor use across member states",
    summary:
      "Sweeping regulatory changes to indoor pyrethroid applications take effect Q1 2027 across all EU member states.",
    category: "Regulatory",
    source: "EUR-Lex",
    time: "4 days ago",
    image: "/pl7.jpg",
  },
  {
    title: "Sumitomo Chemical expands APAC distribution network into Vietnam",
    summary:
      "Three new distribution agreements signed in Q2 2026 signal aggressive expansion into Southeast Asian markets.",
    category: "Industry",
    source: "Nikkei Asia",
    time: "5 days ago",
    image: "/pl8.jpg",
  },
  {
    title: "Clinical study confirms microbiome-safe mosquito repellent formula",
    summary:
      "Peer-reviewed trial across 1,200 participants shows zero disruption to skin microbiome over 90 days.",
    category: "Safety",
    source: "Journal of Vector Ecology",
    time: "6 days ago",
    image: "/pl10.jpg",
  },
  {
    title: "Dengue cases surge 44% in Southeast Asia: WHO issues advisory",
    summary:
      "Early monsoon onset and urban water storage drive record Aedes breeding across five countries.",
    category: "Disease",
    source: "WHO",
    time: "1 week ago",
    image: "/pl9.jpg",
  },
  {
    title: "Dr. Priya Sharma on the future of biopesticide regulation",
    summary:
      "A leading regulatory scientist on fast-track approvals, data packages and what growers should expect next.",
    category: "Interviews",
    source: "AgroPages",
    time: "1 week ago",
    image: "/nr-interview.jpg",
  },
];
