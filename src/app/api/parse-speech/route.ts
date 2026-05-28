import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { callAI, AICallError, AIUnavailableError } from "@/lib/ai/call-ai";
import { getFastConfig } from "@/lib/ai/router";
import { requireUser } from "@/lib/auth/require-user";
import { TRADES } from "@/lib/quotes/schema";
import { parseSpeechLocal } from "@/lib/voice/parse-local";
import type { VoiceParseResult } from "@/lib/voice/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  transcript: z.string().trim().min(1).max(4000),
});

const ParsedSchema = z.object({
  client_name: z.string().min(1).nullable(),
  trade: z.enum(TRADES).nullable(),
  estimate_amount: z.number().positive().max(1_000_000).nullable(),
  days_silent: z.number().int().min(0).max(365).nullable(),
  city: z.string().nullable(),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  client_phone: z.string().nullable(),
  client_email: z.string().email().nullable().optional(),
  job_description: z.string().nullable(),
  confidence: z
    .object({
      client_name: z.number().min(0).max(100).optional(),
      trade: z.number().min(0).max(100).optional(),
      estimate_amount: z.number().min(0).max(100).optional(),
      days_silent: z.number().min(0).max(100).optional(),
    })
    .optional(),
  missing_required: z.array(z.string()).optional(),
});

function buildPrompt(transcript: string): string {
  return `Convert this spoken English from a US home-service contractor into structured JSON.
The contractor is dictating one silent quote.

Required fields (must extract or mark missing):
- client_name (first name only)
- trade (one of: HVAC, Plumbing, Roofing, Electrical, Remodeling, General Contracting, Painting, Landscaping)
- estimate_amount (USD integer)
- days_silent (integer)

Optional fields (extract if spoken):
- city, state (2-letter), client_phone, client_email, job_description

Number rules (spoken → integer):
"twelve hundred" = 1200
"fifteen hundred" = 1500
"eighty five hundred" = 8500
"twenty four hundred" = 2400
"seven thousand nine hundred" = 7900
"forty two hundred" = 4200
"eleven hundred" = 1100
"nineteen hundred" = 1900
"a hundred" never means 100 when context is "days silent"

Date rules:
"yesterday" = days_silent: 1
"a week ago" = days_silent: 7
"last Tuesday" = compute days from today's Tuesday
"six days ago" = days_silent: 6

CRITICAL: "10 days silent" -> days_silent: 10, NEVER estimate_amount: 10
CRITICAL: Phone numbers are never estimate amounts
CRITICAL: If a field was not spoken, return null, do not invent

Return JSON only, no markdown:
{
  "client_name": string|null,
  "trade": "HVAC"|"Plumbing"|"Roofing"|"Electrical"|"Remodeling"|"General Contracting"|"Painting"|"Landscaping"|null,
  "estimate_amount": number|null,
  "days_silent": number|null,
  "city": string|null,
  "state": string|null,
  "client_phone": string|null,
  "client_email": string|null,
  "job_description": string|null,
  "confidence": {
    "client_name": 0-100,
    "trade": 0-100,
    "estimate_amount": 0-100,
    "days_silent": 0-100
  },
  "missing_required": string[]
}

TRANSCRIPT:
"""
${transcript}
"""`;
}

export async function POST(request: NextRequest) {
  // Require an authenticated session — voice capture must be a logged-in user.
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { transcript: string };
  try {
    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Try the AI parser first; fall back to local regex parser on any failure.
  const fastConfig = getFastConfig();
  let aiResult: VoiceParseResult | null = null;

  if (fastConfig.apiKey) {
    try {
      const raw = await callAI(
        [
          {
            role: "system",
            content:
              "You convert spoken contractor dictation into structured JSON. Return ONLY JSON.",
          },
          { role: "user", content: buildPrompt(body.transcript) },
        ],
        { jsonMode: true, temperature: 0.1, maxTokens: 400, config: fastConfig },
      );
      const candidate = JSON.parse(raw) as unknown;
      const validated = ParsedSchema.safeParse(candidate);
      if (validated.success) {
        aiResult = {
          ...validated.data,
          // ParsedSchema treats client_email as optional; normalize to null.
          client_email: validated.data.client_email ?? null,
          _key: String(Date.now()),
        };
      }
    } catch (err) {
      if (err instanceof AIUnavailableError || err instanceof AICallError) {
        // fall through to local parser
      } else {
        // unexpected — still fall back
      }
    }
  }

  const finalResult = aiResult ?? parseSpeechLocal(body.transcript);
  return NextResponse.json({ data: finalResult });
}
