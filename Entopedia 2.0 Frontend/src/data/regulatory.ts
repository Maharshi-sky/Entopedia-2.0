// Regulatory & Actives: the active-ingredient register and competitor filings.

// API resource: GET /actives → Active[]
export type ActiveStatus = "Approved" | "Under Review" | "Restricted";
export type Risk = "Low" | "Medium" | "High";

export type Active = {
  name: string;
  markets: string;
  status: ActiveStatus;
  maxConc: string;
  formats: string;
  patentCliff: string;
  risk: Risk;
};

export const actives: Active[] = [
  { name: "Transfluthrin", markets: "India, Brazil, EU", status: "Under Review", maxConc: "0.05%", formats: "Coil, LV, Card", patentCliff: "2027", risk: "High" },
  { name: "Prallethrin", markets: "India, Australia, US", status: "Approved", maxConc: "0.1%", formats: "LV, Aerosol", patentCliff: "2029", risk: "Low" },
  { name: "D-Allethrin", markets: "India, Brazil", status: "Approved", maxConc: "0.2%", formats: "Coil, Mat", patentCliff: "Expired", risk: "Low" },
  { name: "Meperfluthrin", markets: "India, EU", status: "Approved", maxConc: "0.03%", formats: "LV, Card", patentCliff: "2031", risk: "Medium" },
  { name: "Cypermethrin", markets: "India, US, Brazil", status: "Restricted", maxConc: "0.5%", formats: "Aerosol Spray", patentCliff: "Expired", risk: "Medium" },
  { name: "DEET", markets: "India, US, Australia", status: "Approved", maxConc: "30%", formats: "Cream, Roll-on", patentCliff: "Expired", risk: "Low" },
  { name: "Picaridin", markets: "Australia, EU, US", status: "Approved", maxConc: "20%", formats: "Cream, Spray", patentCliff: "2028", risk: "Low" },
  { name: "Neem Extract", markets: "India", status: "Approved", maxConc: "NR", formats: "Cream, Coil", patentCliff: "N/A", risk: "Low" },
];

// API resource: GET /registrations → Registration[]
export const regulators = ["CIB&RC", "ANVISA", "APVMA", "EPA", "EU BPR"] as const;
export type Regulator = (typeof regulators)[number];

export type Registration = {
  regulator: Regulator;
  brand: string;
  active: string;
  loading: string;
  format: string;
  filed: string; // YYYY-MM-DD
  preLaunch: boolean;
};

export const registrations: Registration[] = [
  { regulator: "CIB&RC", brand: "Good Knight", active: "Meperfluthrin", loading: "0.05%", format: "LV", filed: "2026-06-18", preLaunch: true },
  { regulator: "CIB&RC", brand: "Mortein", active: "Transfluthrin", loading: "0.04%", format: "Coil", filed: "2026-05-30", preLaunch: false },
  { regulator: "ANVISA", brand: "Raid", active: "Prallethrin", loading: "0.1%", format: "Aerosol", filed: "2026-06-10", preLaunch: true },
  { regulator: "EPA", brand: "Baygon", active: "Cypermethrin", loading: "0.3%", format: "Aerosol", filed: "2026-05-22", preLaunch: false },
  { regulator: "EU BPR", brand: "All Out", active: "D-Allethrin", loading: "0.15%", format: "Mat", filed: "2026-06-01", preLaunch: false },
  { regulator: "APVMA", brand: "Mortein", active: "Picaridin", loading: "20%", format: "Roll-on", filed: "2026-04-15", preLaunch: false },
];
