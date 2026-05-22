export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (/^\+\d{7,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 7 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "[unknown]";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "[redacted]";
  return `***-***-${digits.slice(-4)}`;
}

export function phoneCandidates(raw: string): string[] {
  const normalized = normalizePhone(raw);
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (normalized) out.add(normalized);
  return Array.from(out);
}
