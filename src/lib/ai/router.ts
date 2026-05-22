/**
 * AI provider routing. Reads env to determine which provider + model to use
 * for the "writer" (recovery messages) and the "fast" (lightweight) roles.
 *
 * Defaults: Groq + llama-3.3-70b-versatile (writer), llama-3.1-8b-instant (fast).
 * No xAI / grok defaults. OpenAI is optional via env switch.
 */

export type AIProvider = "groq" | "openai";

export type AIConfig = {
  provider: AIProvider;
  model: string;
  apiKey: string | undefined;
};

function readProvider(name: string, fallback: AIProvider): AIProvider {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "groq" || raw === "") return "groq";
  return fallback;
}

function apiKeyFor(provider: AIProvider): string | undefined {
  if (provider === "openai") return process.env.OPENAI_API_KEY?.trim() || undefined;
  return process.env.GROQ_API_KEY?.trim() || undefined;
}

export function getWriterConfig(): AIConfig {
  const provider = readProvider("AI_WRITER_PROVIDER", "groq");
  const model =
    process.env.AI_WRITER_MODEL?.trim() || "llama-3.3-70b-versatile";
  return { provider, model, apiKey: apiKeyFor(provider) };
}

export function getFastConfig(): AIConfig {
  const provider = readProvider("AI_FAST_PROVIDER", "groq");
  const model = process.env.AI_FAST_MODEL?.trim() || "llama-3.1-8b-instant";
  return { provider, model, apiKey: apiKeyFor(provider) };
}

export function isWriterAvailable(): boolean {
  return Boolean(getWriterConfig().apiKey);
}

export function providerEndpoint(provider: AIProvider): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "groq":
    default:
      return "https://api.groq.com/openai/v1/chat/completions";
  }
}
