export type Sheet = { name: string; headers: string[]; rows: string[][] };

/** Splits delimited text into records, honouring quoted fields (which may hold the delimiter or line breaks). */
function parseRecords(text: string, delimiter: string, limit = Infinity): string[][] {
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

  for (let i = 0; i < text.length && records.length < limit; i++) {
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
  if (records.length < limit) endRow();
  return records;
}

/**
 * Tab, semicolon (European Excel) or comma: the one that cuts the opening records into the same number of
 * columns most often. Counting delimiters isn't enough: Lens.org writes unquoted "A;;B" lists inside cells,
 * so a comma file can hold more semicolons than commas, but only the comma gives every row the same width.
 */
function detectDelimiter(text: string): string {
  const sample = text.slice(0, 200_000);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", "\t", ";"]) {
    const widths = parseRecords(sample, d, 12).map((r) => r.length).filter((w) => w > 1);
    const tally = new Map<number, number>();
    for (const w of widths) tally.set(w, (tally.get(w) ?? 0) + 1);
    // Most rows sharing one width wins; a wider shared width breaks a tie.
    const [width, rows] = [...tally].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0];
    const score = rows * 1000 + width;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Builds a sheet from raw rows. The header row is the first of the opening rows that is about as wide as the
 * widest one, so a preamble such as Google Patents' "search URL:, https://…" line is skipped. Rows are padded
 * to the header's width.
 */
export function toSheet(name: string, records: string[][]): Sheet {
  const filled = (r: string[]) => r.filter((c) => c.trim()).length;
  const head = records.slice(0, 10);
  const widest = Math.max(0, ...head.map(filled));
  const headerIndex = Math.max(0, head.findIndex((r) => filled(r) >= Math.max(2, Math.ceil(widest * 0.6))));
  const headers = (records[headerIndex] ?? []).map((h) => h.trim());
  const rows = records.slice(headerIndex + 1).map((r) => headers.map((_, i) => r[i] ?? ""));
  if (headers.length === 0 || rows.length === 0) {
    throw new Error("Need a header row and at least one record.");
  }
  return { name, headers, rows };
}

// Parses CSV, TSV or semicolon-separated text, honouring quoted fields.
export function parseDelimited(text: string, name: string): Sheet {
  const clean = text.replace(/^\uFEFF/, ""); // Excel's byte-order mark
  return toSheet(name, parseRecords(clean, detectDelimiter(clean)));
}

// What the analyser holds before a sheet is loaded: no rows, so every step asks for a file first.
export const emptySheet: Sheet = { name: "No sheet loaded", headers: [], rows: [] };
