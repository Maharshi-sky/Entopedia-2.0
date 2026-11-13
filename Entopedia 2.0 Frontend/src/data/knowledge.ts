// Knowledge Hub: ingestion queue, saved assets and suggested questions.

// API resource: GET /knowledge/queue → QueueItem[]
export type QueueStatus = "Indexed" | "Processing" | "Awaiting";
export type QueueItem = { name: string; size: string; status: QueueStatus };

export const ingestionQueue: QueueItem[] = [
  { name: "APAC_Market_Trends_2026.pdf", size: "4.2 MB", status: "Indexed" },
  { name: "Competitor_Pricing_Matrix_Q3.xlsx", size: "1.1 MB", status: "Processing" },
  { name: "Regulatory_BPR_Update_EU.pdf", size: "840 KB", status: "Awaiting" },
];

// API resource: GET /knowledge/assets → SavedAsset[]
export type SavedAsset = { title: string; author: string; when: string };

export const savedAssets: SavedAsset[] = [
  { title: "Q3 Competitor Landscape Report", author: "Sarah Chen", when: "2 days ago" },
  { title: "“Indoor Roach Baits” Claim Search", author: "Rahul Mehta", when: "1 week ago" },
  { title: "Aedes aegypti Identification — Brazil", author: "James Osei", when: "2 weeks ago" },
  { title: "APAC Market Intelligence Snapshot", author: "Sarah Chen", when: "1 month ago" },
];

// API resource: GET /knowledge/suggested-questions → string[]
export const suggestedQuestions: string[] = [
  "What are the top competitor launches in APAC this quarter?",
  "Summarise the EU BPR regulatory changes",
  "Which claims were rejected and why?",
  "What does the pricing matrix say about LV formats?",
];
