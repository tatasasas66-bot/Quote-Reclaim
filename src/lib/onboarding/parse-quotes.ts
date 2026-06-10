/**
 * Silent Money Reveal — quote import parser.
 *
 * Tolerates everything a real contractor might paste:
 *   - Whitespace-separated (multiple spaces / copy from a text file)
 *     e.g. "Martin Alvarez   8500   2026-05-21   email@example.com"
 *   - CSV with headers in any order (name/amount/date/email + synonyms)
 *   - CSV without headers (assumed: name, amount[, date[, email]])
 *   - Tab-separated (Excel/Sheets copy)
 *   - Comma-separated
 *   - Amounts with $, commas, whitespace
 *   - Dates as ISO, slash-style, or integers (interpreted as days_silent)
 *
 * Pure, no DOM, no server, no fetch — safe to unit-test and to run client-side
 * for the preview. The server action re-validates everything, so the parser
 * is best-effort UX, not a security boundary.
 */

export const MAX_IMPORT_ROWS = 100;
const MAX_AMOUNT_USD = 10_000_000;
const MAX_NAME_LEN = 200;

export type ParsedQuote = {
  name: string;
  amount: number;
  daysSilent: number;
  email: string | null;
};

export type ParseSummary = {
  rows: ParsedQuote[];
  skipped: number;
  totalAmount: number;
  truncatedAt: number | null; // set when input had > MAX_IMPORT_ROWS rows
};

const NAME_SYNONYMS = new Set([
  "name",
  "client",
  "customer",
  "homeowner",
  "contact",
]);
const AMOUNT_SYNONYMS = new Set([
  "amount",
  "total",
  "price",
  "value",
  "quote",
  "estimate",
  "$",
  "usd",
]);
const DATE_SYNONYMS = new Set([
  "date",
  "sent",
  "created",
  "quoted",
  "when",
  "sent_at",
  "quote_date",
]);
const EMAIL_SYNONYMS = new Set(["email", "e-mail", "mail", "address"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strip C0 control chars (0x00 to 0x1F) and DEL (0x7F). Built with
// new RegExp(...) instead of a literal class so the source file stays
// ASCII-safe (no accidental literal control bytes).
const CONTROL_CHAR_RE = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

// Three delimiter types: tab, comma, or whitespace-separated.
type Delimiter = "\t" | "," | "ws";

function detectDelimiter(line: string): Delimiter {
  const tabs = (line.match(/\t/g) ?? []).length;
  if (tabs > 0) return "\t";
  // Count only "structural" commas — ones NOT preceded by a digit.
  // A comma between digits (e.g. "$8,500" → "8,5") is a thousands separator,
  // not a field delimiter; counting it would misclassify a space-separated
  // row that happens to contain a formatted amount.
  const structuralCommas = (line.match(/(?<!\d),/g) ?? []).length;
  if (structuralCommas > 0) return ",";
  return "ws";
}

function splitRow(line: string, delim: "\t" | ","): string[] {
  if (delim === "\t") return line.split("\t").map((c) => c.trim());
  // Lightweight CSV split — handles quoted fields containing commas.
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

function classifyHeader(cell: string): "name" | "amount" | "date" | "email" | null {
  const k = cell.toLowerCase().trim().replace(/[_\s-]+/g, "_");
  const groups: Array<["name" | "amount" | "date" | "email", Set<string>]> = [
    ["name", NAME_SYNONYMS],
    ["amount", AMOUNT_SYNONYMS],
    ["date", DATE_SYNONYMS],
    ["email", EMAIL_SYNONYMS],
  ];
  for (const [kind, syns] of groups) {
    const words = Array.from(syns);
    for (const w of words) {
      if (k === w || k.startsWith(`${w}_`) || k.endsWith(`_${w}`)) return kind;
    }
  }
  return null;
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s$,£€¥]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > MAX_AMOUNT_USD) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Returns days between today and the parsed date, clamped to [0, 365].
 * Falls back to interpreting a bare integer as "days silent" directly
 * (so a contractor can type "9" instead of a real date).
 * Empty / unparseable → 0.
 */
export function parseDaysSilent(raw: string, now = Date.now()): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (/^\d{1,3}$/.test(trimmed)) {
    const n = Number(trimmed);
    return Math.max(0, Math.min(365, n));
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return 0;
  const diffDays = Math.floor((now - parsed) / 86_400_000);
  return Math.max(0, Math.min(365, diffDays));
}

function sanitizeName(raw: string): string | null {
  const cleaned = raw.replace(CONTROL_CHAR_RE, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_NAME_LEN);
}

function sanitizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(cleaned)) return null;
  return cleaned.slice(0, 320);
}

type ColumnMap = { name: number; amount: number; date: number; email: number };

function detectHeader(cells: string[]): ColumnMap | null {
  const map: Partial<ColumnMap> = {};
  let hits = 0;
  for (let i = 0; i < cells.length; i++) {
    const kind = classifyHeader(cells[i]);
    if (!kind) continue;
    if (map[kind] === undefined) {
      map[kind] = i;
      hits++;
    }
  }
  if (map.name !== undefined && map.amount !== undefined && hits >= 2) {
    return {
      name: map.name,
      amount: map.amount,
      date: map.date ?? -1,
      email: map.email ?? -1,
    };
  }
  return null;
}

function defaultColumnMap(width: number): ColumnMap {
  return {
    name: 0,
    amount: width >= 2 ? 1 : -1,
    date: width >= 3 ? 2 : -1,
    email: width >= 4 ? 3 : -1,
  };
}

/**
 * Parse one whitespace-separated line using a money-first scan.
 *
 * Algorithm:
 *   1. Split on any whitespace into tokens.
 *   2. Find the FIRST token (at index ≥ 1) that is a valid money amount.
 *      Requiring index ≥ 1 ensures the name has at least one token.
 *   3. Everything before the amount token is joined as the customer name.
 *   4. Tokens after the amount are scanned for an optional date and email
 *      in any order — email detected by @-regex, date by ISO parse or bare
 *      integer (1–3 digits treated as days-silent).
 */
function parseSpaceSeparatedRow(line: string, now: number): ParsedQuote | null {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  let amountIdx = -1;
  let amount: number | null = null;
  for (let i = 1; i < tokens.length; i++) {
    const a = parseAmount(tokens[i]);
    if (a !== null) {
      amountIdx = i;
      amount = a;
      break;
    }
  }
  if (amountIdx < 0 || amount === null) return null;

  const name = sanitizeName(tokens.slice(0, amountIdx).join(" "));
  if (!name) return null;

  const rest = tokens.slice(amountIdx + 1);
  let dateRaw = "";
  let emailRaw = "";
  for (const token of rest) {
    if (!emailRaw && EMAIL_RE.test(token.toLowerCase())) {
      emailRaw = token;
    } else if (
      !dateRaw &&
      (/^\d{1,3}$/.test(token) || !Number.isNaN(Date.parse(token)))
    ) {
      dateRaw = token;
    }
  }

  const daysSilent = parseDaysSilent(dateRaw, now);
  const email = sanitizeEmail(emailRaw);

  return { name, amount, daysSilent, email };
}

/** Process all lines as whitespace-separated rows (money-first algorithm). */
function parseWhitespaceSeparated(lines: string[], now: number): ParseSummary {
  const truncatedAt = lines.length > MAX_IMPORT_ROWS ? MAX_IMPORT_ROWS : null;
  const limited = lines.slice(0, MAX_IMPORT_ROWS);

  const seen = new Set<string>();
  const out: ParsedQuote[] = [];
  let skipped = 0;
  let totalAmount = 0;

  for (const line of limited) {
    const parsed = parseSpaceSeparatedRow(line, now);
    if (!parsed) {
      skipped++;
      continue;
    }
    const key = `${parsed.name.toLowerCase()}|${parsed.amount}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    out.push(parsed);
    totalAmount += parsed.amount;
  }

  return { rows: out, skipped, totalAmount, truncatedAt };
}

/**
 * Parse a pasted blob into a clean, capped, deduped list of quotes.
 * Skipped rows are counted but never crash the parser.
 */
export function parseSilentQuotesInput(
  raw: string,
  now: number = Date.now(),
): ParseSummary {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], skipped: 0, totalAmount: 0, truncatedAt: null };
  }

  const delim = detectDelimiter(lines[0]);

  // Whitespace-separated path (no structural delimiter found): money-first
  // scan handles multi-word names like "Martin Alvarez  8500  2026-05-21".
  if (delim === "ws") {
    return parseWhitespaceSeparated(lines, now);
  }

  // Structured delimiter path (CSV or TSV) — TypeScript narrows delim here.
  const firstCells = splitRow(lines[0], delim);
  const header = detectHeader(firstCells);
  const dataStart = header ? 1 : 0;
  // For no-header pastes, the column map needs to accommodate the WIDEST
  // row — otherwise a leading row with 3 cells would hide the email column
  // on later rows that have 4.
  let maxWidth = firstCells.length;
  if (!header) {
    for (let i = 1; i < lines.length; i++) {
      const w = splitRow(lines[i], delim).length;
      if (w > maxWidth) maxWidth = w;
    }
  }
  const columnMap = header ?? defaultColumnMap(maxWidth);

  const dataLines = lines.slice(dataStart);
  const truncatedAt =
    dataLines.length > MAX_IMPORT_ROWS ? MAX_IMPORT_ROWS : null;
  const limited = dataLines.slice(0, MAX_IMPORT_ROWS);

  const seen = new Set<string>();
  const out: ParsedQuote[] = [];
  let skipped = 0;
  let totalAmount = 0;

  for (const line of limited) {
    const cells = splitRow(line, delim);
    if (cells.length === 0) {
      skipped++;
      continue;
    }
    const nameRaw = cells[columnMap.name] ?? "";
    const amountRaw = columnMap.amount >= 0 ? cells[columnMap.amount] ?? "" : "";
    const dateRaw = columnMap.date >= 0 ? cells[columnMap.date] ?? "" : "";
    let emailRaw = columnMap.email >= 0 ? cells[columnMap.email] ?? "" : "";

    // Positional fallback: if there's no explicit email column but cell 3
    // happens to look like an email, treat it as the email instead of date.
    if (!header && columnMap.email < 0 && cells.length >= 3) {
      const maybeEmail = sanitizeEmail(cells[2]);
      if (maybeEmail) emailRaw = cells[2];
    }

    const name = sanitizeName(nameRaw);
    const amount = parseAmount(amountRaw);
    if (!name || amount === null) {
      skipped++;
      continue;
    }

    const daysSilent = parseDaysSilent(dateRaw, now);
    const email = sanitizeEmail(emailRaw);

    // Dedupe on (name + amount).
    const key = `${name.toLowerCase()}|${amount}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    out.push({ name, amount, daysSilent, email });
    totalAmount += amount;
  }

  return { rows: out, skipped, totalAmount, truncatedAt };
}
