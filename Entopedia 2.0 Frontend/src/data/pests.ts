// Pest Vision encyclopedia.
// API resource: GET /pests → Pest[]

export type PestType = "Mosquito" | "Cockroach" | "Fly" | "Ant" | "Bed bug" | "Rodent";

export type Pest = {
  name: string;
  scientific: string;
  type: PestType;
  regions: string;
  note: string;
  // Image URL or a path under /public; a placeholder shows until set.
  image?: string;
};

export const pests: Pest[] = [
  { name: "Yellow fever mosquito", scientific: "Aedes aegypti", type: "Mosquito", regions: "Tropics & subtropics", note: "Day-biting vector of dengue, Zika and chikungunya." },
  { name: "Malaria mosquito", scientific: "Anopheles gambiae", type: "Mosquito", regions: "Sub-Saharan Africa", note: "Primary vector of Plasmodium falciparum malaria." },
  { name: "Southern house mosquito", scientific: "Culex quinquefasciatus", type: "Mosquito", regions: "Global, urban", note: "Night-biting nuisance; vector of West Nile virus." },
  { name: "German cockroach", scientific: "Blattella germanica", type: "Cockroach", regions: "Global, indoor", note: "Fast-breeding; widespread insecticide resistance." },
  { name: "American cockroach", scientific: "Periplaneta americana", type: "Cockroach", regions: "Global, sewers", note: "Large species common in drains and basements." },
  { name: "House fly", scientific: "Musca domestica", type: "Fly", regions: "Global", note: "Mechanical carrier of over 100 pathogens." },
  { name: "Pharaoh ant", scientific: "Monomorium pharaonis", type: "Ant", regions: "Global, indoor", note: "Multi-queen colonies; spreads when sprayed." },
  { name: "Common bed bug", scientific: "Cimex lectularius", type: "Bed bug", regions: "Global", note: "Nocturnal blood feeder; pyrethroid resistant." },
  { name: "Brown rat", scientific: "Rattus norvegicus", type: "Rodent", regions: "Global, urban", note: "Burrowing rodent; reservoir for leptospirosis." },
];
