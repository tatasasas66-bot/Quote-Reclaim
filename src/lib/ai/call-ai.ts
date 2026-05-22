import { getWriterConfig, providerEndpoint, type AIConfig } from "./router";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CallAIOptions = {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  config?: AIConfig;
};

export class AIUnavailableError extends Error {
  constructor(message = "AI provider not configured") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

export class AICallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AICallError";
  }
}

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

/**
 * Call a chat-completion-style provider (Groq or OpenAI). Returns the raw
 * string content of the first choice. Never logs the API key or full
 * payload — caller is responsible for handling errors.
 */
export async function callAI(
  messages: ChatMessage[],
  opts: CallAIOptions = {},
): Promise<string> {
  const cfg = opts.config ?? getWriterConfig();
  if (!cfg.apiKey) {
    throw new AIUnavailableError(`No API key for provider ${cfg.provider}`);
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? 0.55,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  let response: Response;
  try {
    response = await fetch(providerEndpoint(cfg.provider), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw new AICallError(
      `Network error: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AICallError(
      `Provider HTTP ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const data = (await response.json().catch(() => null)) as
    | ChatCompletionResponse
    | null;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new AICallError("Empty response from provider");
  }
  return content;
}
