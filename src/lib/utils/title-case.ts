/**
 * Title-cases a person's name for display.
 *
 *   "tom" -> "Tom"
 *   "TOM HARRIS" -> "Tom Harris"
 *   "mary-jane o'connor" -> "Mary-Jane O'Connor"
 *
 * Particles like "von", "de", "del" are lowercased between capitalized words,
 * except when they are the first token.
 */
const PARTICLES = new Set([
  "de",
  "del",
  "la",
  "von",
  "van",
  "der",
  "den",
  "y",
  "da",
  "di",
  "do",
]);

export function titleCaseName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/(\s+)/)
    .map((token, idx) => {
      if (/^\s+$/.test(token)) return " ";
      const lower = token.toLowerCase();
      if (idx > 0 && PARTICLES.has(lower)) return lower;
      return capitalizeWord(token);
    })
    .join("");
}

function capitalizeWord(word: string): string {
  return word
    .split(/([-'])/)
    .map((part) =>
      part === "-" || part === "'"
        ? part
        : part.length === 0
          ? part
          : part[0].toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
}
