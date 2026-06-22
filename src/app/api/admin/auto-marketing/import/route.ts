import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponseIfNotAdmin } from "@/lib/auth/require-admin";
import { importLeads } from "@/lib/auto-marketing/repo";
import type { ImportedLeadRow } from "@/lib/auto-marketing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/auto-marketing/import
 *
 * Accepts either:
 *   - JSON array of lead objects (Apify-style payload)
 *   - { csv: "<csv string>" } for raw CSV upload
 *
 * Both shapes map to the same ImportedLeadRow schema. Admin-gated.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await forbiddenResponseIfNotAdmin();
  if (guard) return guard;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  let rows: ImportedLeadRow[] = [];

  if (Array.isArray(payload)) {
    // JSON array of lead objects (Apify-style).
    rows = payload as ImportedLeadRow[];
  } else if (
    payload &&
    typeof payload === "object" &&
    "csv" in payload &&
    typeof (payload as { csv: unknown }).csv === "string"
  ) {
    rows = parseCsv((payload as { csv: string }).csv);
  } else {
    return NextResponse.json(
      { error: "Expected JSON array or { csv: string }" },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found" },
      { status: 400 },
    );
  }

  const result = await importLeads(rows);
  return NextResponse.json(result);
}

/**
 * Minimal CSV parser — handles the documented import columns.
 * Not a general-purpose CSV parser; expects a header row.
 */
function parseCsv(csv: string): ImportedLeadRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const rows: ImportedLeadRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    if (!obj.company || !obj.trade) continue;
    rows.push({
      company: obj.company,
      first_name: obj.first_name || undefined,
      email: obj.email || undefined,
      phone: obj.phone || undefined,
      website: obj.website || undefined,
      city: obj.city || undefined,
      state: obj.state || undefined,
      trade: obj.trade,
      niche: obj.niche || undefined,
      source: obj.source || undefined,
      gbp_url: obj.gbp_url || undefined,
      review_count: obj.review_count || undefined,
      review_response_rate: obj.review_response_rate || undefined,
      public_signal: obj.public_signal || undefined,
      last_gbp_post: obj.last_gbp_post || undefined,
      license_status: obj.license_status || undefined,
      notes: obj.notes || undefined,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
