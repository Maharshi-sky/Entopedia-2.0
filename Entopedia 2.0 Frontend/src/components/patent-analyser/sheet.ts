export type Sheet = { name: string; headers: string[]; rows: string[][] };

// Parses CSV or TSV text (delimiter picked from the first line), honouring quoted fields.
export function parseDelimited(text: string, name: string): Sheet {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endRow = () => {
    row.push(field);
    if (row.some((cell) => cell.trim())) records.push(row);
    row = [];
    field = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
  }
  endRow();

  const [headers = [], ...rows] = records;
  if (headers.length === 0 || rows.length === 0) {
    throw new Error("Need a header row and at least one record.");
  }
  return { name, headers: headers.map((h) => h.trim()), rows };
}

const assignees = [
  "Godrej Consumer",
  "SC Johnson",
  "Bayer",
  "Reckitt Benckiser",
  "Jyothy Labs",
  "Sumitomo Chemical",
  "Dabur",
];
const subjects = [
  ["Meperfluthrin", "liquid vaporizer"],
  ["Transfluthrin", "passive emanator"],
  ["Prallethrin", "mosquito coil"],
  ["Nootkatone", "topical repellent"],
  ["Picaridin", "repellent card"],
  ["Flupyradifurone", "aerosol spray"],
  ["D-Allethrin", "smokeless coil"],
];
const improvements = [
  "improved release profile",
  "extended protection duration",
  "reduced smoke output",
  "low-dose efficacy",
];
const offices = ["WO", "IN", "US", "EP", "CN"];
const pad = (n: number) => String(n).padStart(2, "0");

// Deterministic 28-record sample so every screen has data before a file is loaded.
export const workedExample: Sheet = {
  name: "Worked example",
  headers: ["Publication Number", "Title", "Abstract", "Assignee", "Priority Date"],
  rows: Array.from({ length: 28 }, (_, i) => {
    const [active, format] = subjects[i % subjects.length];
    const improvement = improvements[i % improvements.length];
    const year = 2019 + (i % 7);
    return [
      `${offices[i % offices.length]}${year}${String(104210 + i * 1337).padStart(6, "0")}`,
      `${active} ${format} with ${improvement}`,
      `A ${format} formulation of ${active.toLowerCase()} providing ${improvement} against household mosquitoes.`,
      assignees[(i * 3) % assignees.length],
      `${year}-${pad(1 + ((i * 5) % 12))}-${pad(1 + ((i * 7) % 28))}`,
    ];
  }),
};
