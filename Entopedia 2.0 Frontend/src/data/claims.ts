// Claims Evidence: claim × pest × format × market substantiation matrix.
// API resource: GET /claims-evidence → ClaimEvidence[]

export type EvidenceStatus =
  | "Substantiated"
  | "Argument-supported"
  | "Literature-supported"
  | "Unsupported"
  | "Expired";

export type ClaimEvidence = {
  claim: string;
  pest: string;
  format: string;
  market: string;
  status: EvidenceStatus;
};

export const claimsEvidence: ClaimEvidence[] = [
  { claim: "8-hour protection", pest: "Aedes aegypti", format: "LV", market: "India", status: "Substantiated" },
  { claim: "99.9% knockdown", pest: "Anopheles", format: "Aerosol", market: "India", status: "Substantiated" },
  { claim: "Residue-free", pest: "Culex", format: "Cream", market: "EU", status: "Argument-supported" },
  { claim: "Kills dengue mosquitoes", pest: "Aedes aegypti", format: "Coil", market: "India", status: "Literature-supported" },
  { claim: "Fragrance-free", pest: "Culex", format: "LV", market: "Australia", status: "Substantiated" },
  { claim: "12-hour protection", pest: "Aedes aegypti", format: "Card", market: "Brazil", status: "Unsupported" },
  { claim: "Safe for children", pest: "All", format: "Cream", market: "India", status: "Expired" },
  { claim: "Plant-derived actives", pest: "Anopheles", format: "Coil", market: "India", status: "Literature-supported" },
];
