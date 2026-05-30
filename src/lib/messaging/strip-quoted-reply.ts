/**
 * Trim quoted history from an inbound email reply down to the homeowner's
 * top-most response, then cap at MAX_REPLY_CHARS so it fits the same
 * recovery_events.reply_text shape the SMS path uses.
 *
 * Handles the markers that appear in practically every mail client:
 *   - Gmail / Apple Mail style: "On Tue, May 28, 2026 at 9:00 AM, X wrote:"
 *   - Outlook / Exchange: "-----Original Message-----"
 *   - Outlook header block: "From: ... Sent: ..."
 *   - Plain ">" quote prefix on every quoted line
 *   - Forwarded markers: "Begin forwarded message:" / "---------- Forwarded message"
 *
 * Pure + deterministic so it's trivial to test.
 */

const MAX_REPLY_CHARS = 1000;

const TOP_REPLY_MARKERS: ReadonlyArray<RegExp> = [
  // English "On ... wrote:" — match across line breaks since the marker often
  // wraps. Anchor on a newline so we don't chop inside a real sentence.
  /\n[ \t]*On\b[\s\S]{1,300}?\bwrote:\s*\n/i,
  /\n[ \t]*-{2,}\s*Original Message\s*-{2,}/i,
  /\n[ \t]*From:\s.+\n[ \t]*Sent:\s.+/i,
  /\n[ \t]*Begin forwarded message:/i,
  /\n[ \t]*-{2,}\s*Forwarded message\s*-{2,}/i,
  /\n[ \t]*Sent from my (?:iPhone|iPad|Android|Galaxy|phone)\b/i,
];

function dropQuotedLines(body: string): string {
  // Find the first line that begins with ">" (after optional whitespace) and
  // chop everything from there. Replies inline-with-quotes are unusual on
  // mobile; treating the first quote-prefixed line as the boundary is the
  // right default and matches what Gmail / Front / Help Scout all do.
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^[ \t]*>/.test(lines[i])) {
      return lines.slice(0, i).join("\n");
    }
  }
  return body;
}

export function stripQuotedReply(raw: string | null | undefined): string {
  if (!raw) return "";

  // Normalize line endings before any regex matching.
  let body = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let earliestCut = body.length;
  for (const marker of TOP_REPLY_MARKERS) {
    const match = marker.exec(body);
    if (match && match.index < earliestCut) {
      earliestCut = match.index;
    }
  }
  body = body.slice(0, earliestCut);

  body = dropQuotedLines(body);

  // Collapse runs of blank lines that mail clients often pad with.
  body = body.replace(/\n{3,}/g, "\n\n").trim();

  if (body.length > MAX_REPLY_CHARS) {
    body = body.slice(0, MAX_REPLY_CHARS);
  }
  return body;
}

/**
 * Pull a clean lowercase email out of "Display Name <addr@example.com>" or a
 * bare "addr@example.com". Returns null when the value is missing or not a
 * recognizable email — callers should 200-ack and ignore in that case.
 */
export function parseFromEmail(raw: unknown): string | null {
  if (raw == null) return null;
  const value =
    typeof raw === "string"
      ? raw
      : typeof raw === "object" && raw !== null && "email" in raw
        ? String((raw as { email: unknown }).email ?? "")
        : "";
  const trimmed = value.trim();
  if (!trimmed) return null;

  // "Display Name <addr@example.com>"
  const angle = /<([^>]+)>/.exec(trimmed);
  const candidate = (angle ? angle[1] : trimmed).trim().toLowerCase();

  // Minimal RFC-5321-ish validation — keeps junk like "undisclosed-recipients"
  // out of the SQL filter without trying to be a full parser.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate;
}
