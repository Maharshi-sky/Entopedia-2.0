// Audit & Provenance: log of every AI query.
// API resource: GET /audit-log → AuditEntry[]  (newest first)

export type Retrieval = "Retrieved" | "Inferred";

export type AuditEntry = {
  id: string;
  at: string; // YYYY-MM-DD HH:mm
  user: string;
  query: string;
  modules: string[];
  sources: string[];
  confidence: number;
  retrieval: Retrieval;
};

export const auditLog: AuditEntry[] = [
  { id: "q1", at: "2026-07-30 09:14", user: "Rahul Mehta", query: "Transfluthrin registration status India", modules: ["Regulatory", "Knowledge Hub"], sources: ["CIB&RC Gazette", "WHO TRS"], confidence: 94, retrieval: "Retrieved" },
  { id: "q2", at: "2026-07-30 09:02", user: "Sarah Chen", query: "8-hour protection claim evidence for LV", modules: ["Claims Evidence"], sources: ["J. Med. Entomol. 2024", "CIB&RC"], confidence: 91, retrieval: "Retrieved" },
  { id: "q3", at: "2026-07-29 17:45", user: "Priya Sharma", query: "Good Knight vs Mortein LV market share APAC", modules: ["Competitor Intelligence", "Dashboard"], sources: ["Nielsen India Jul 2026"], confidence: 87, retrieval: "Inferred" },
  { id: "q4", at: "2026-07-29 16:30", user: "James Osei", query: "EU BPR pyrethroid indoor restriction timeline", modules: ["Regulatory"], sources: ["EUR-Lex BPR 2026"], confidence: 96, retrieval: "Retrieved" },
  { id: "q5", at: "2026-07-29 14:11", user: "Sarah Chen", query: "KT50 benchmark for prallethrin LV formulation", modules: ["PLM / LIMS", "Knowledge Hub"], sources: ["WHO TRS 936", "Internal SOP"], confidence: 93, retrieval: "Retrieved" },
  { id: "q6", at: "2026-07-28 11:20", user: "Rahul Mehta", query: "Spatial repellent patents 2025 — landscape review", modules: ["Competitor Intelligence"], sources: ["USPTO", "EPO patent DB"], confidence: 89, retrieval: "Inferred" },
];
