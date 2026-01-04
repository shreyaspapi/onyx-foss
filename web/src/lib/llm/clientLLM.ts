/**
 * Client-side LLM library for encrypted chat mode
 *
 * Allows direct communication with LLM providers from the browser,
 * bypassing the server for true end-to-end encryption.
 */

/**
 * Supported LLM providers
 */
export type LLMProvider = "openai" | "anthropic" | "azure" | "ollama" | "google";

/**
 * Configuration for an LLM client
 */
export interface LLMClientConfig {
  /** LLM provider */
  provider: LLMProvider;
  /** API key for the provider */
  apiKey: string;
  /** Custom API base URL (for proxies or local models) */
  apiBase?: string;
  /** Model name/identifier */
  modelName: string;
  /** Temperature setting (0-2) */
  temperature: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** System prompt */
  systemPrompt?: string;
}

/**
 * Message format for chat completion
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * A streaming chunk from the LLM
 */
export interface StreamChunk {
  /** The text content of this chunk */
  content: string;
  /** Whether this is the final chunk */
  done: boolean;
  /** Usage stats (only on final chunk) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Error thrown by LLM operations
 */
export class LLMError extends Error {
  statusCode?: number;
  provider: LLMProvider;

  constructor(message: string, provider: LLMProvider, statusCode?: number) {
    super(message);
    this.name = "LLMError";
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

/**
 * Default API base URLs for each provider
 */
export const DEFAULT_API_BASES: Record<LLMProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  azure: "", // Requires custom endpoint
  ollama: "http://localhost:11434",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

/**
 * Stream a chat completion from an LLM provider
 *
 * @param config - LLM configuration
 * @param messages - Chat messages
 * @param signal - Optional AbortSignal for cancellation
 * @yields StreamChunk objects containing the response
 */
export async function* streamChatCompletion(
  config: LLMClientConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  switch (config.provider) {
    case "openai":
    case "azure":
      yield* streamOpenAI(config, messages, signal);
      break;
    case "anthropic":
      yield* streamAnthropic(config, messages, signal);
      break;
    case "google":
      yield* streamGoogle(config, messages, signal);
      break;
    case "ollama":
      yield* streamOllama(config, messages, signal);
      break;
    default:
      throw new LLMError(`Unsupported provider: ${config.provider}`, config.provider);
  }
}

/**
 * Stream from OpenAI-compatible APIs (OpenAI, Azure)
 */
async function* streamOpenAI(
  config: LLMClientConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  const baseUrl = config.apiBase || DEFAULT_API_BASES.openai;
  const url = `${baseUrl}/chat/completions`;

  // Prepare messages with system prompt
  const allMessages = config.systemPrompt
    ? [{ role: "system" as const, content: config.systemPrompt }, ...messages]
    : messages;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: allMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new LLMError(
      `OpenAI API error: ${error}`,
      config.provider,
      response.status
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new LLMError("No response body", config.provider);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            yield { content: "", done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield { content: delta, done: false };
            }

            // Check for finish reason
            if (parsed.choices?.[0]?.finish_reason) {
              yield {
                content: "",
                done: true,
                usage: parsed.usage
                  ? {
                      promptTokens: parsed.usage.prompt_tokens,
                      completionTokens: parsed.usage.completion_tokens,
                      totalTokens: parsed.usage.total_tokens,
                    }
                  : undefined,
              };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream from Anthropic Claude API
 */
async function* streamAnthropic(
  config: LLMClientConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  const baseUrl = config.apiBase || DEFAULT_API_BASES.anthropic;
  const url = `${baseUrl}/messages`;

  // Anthropic uses a different message format - system is separate
  const systemMessage = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: chatMessages,
      system: config.systemPrompt || systemMessage?.content,
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new LLMError(
      `Anthropic API error: ${error}`,
      config.provider,
      response.status
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new LLMError("No response body", config.provider);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "content_block_delta") {
              const delta = parsed.delta?.text;
              if (delta) {
                yield { content: delta, done: false };
              }
            } else if (parsed.type === "message_stop") {
              yield { content: "", done: true };
              return;
            } else if (parsed.type === "message_delta") {
              if (parsed.usage) {
                yield {
                  content: "",
                  done: true,
                  usage: {
                    promptTokens: parsed.usage.input_tokens || 0,
                    completionTokens: parsed.usage.output_tokens || 0,
                    totalTokens:
                      (parsed.usage.input_tokens || 0) +
                      (parsed.usage.output_tokens || 0),
                  },
                };
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream from Google Gemini API
 */
async function* streamGoogle(
  config: LLMClientConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  const baseUrl = config.apiBase || DEFAULT_API_BASES.google;
  const url = `${baseUrl}/models/${config.modelName}:streamGenerateContent?key=${config.apiKey}`;

  // Convert messages to Gemini format
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  // Find system message
  const systemMessage = messages.find((m) => m.role === "system");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents,
      systemInstruction: systemMessage
        ? { parts: [{ text: systemMessage.content }] }
        : config.systemPrompt
          ? { parts: [{ text: config.systemPrompt }] }
          : undefined,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new LLMError(
      `Google API error: ${error}`,
      config.provider,
      response.status
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new LLMError("No response body", config.provider);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini returns newline-separated JSON objects
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") {
          continue;
        }

        try {
          // Remove trailing comma if present
          const jsonStr = trimmed.replace(/,$/, "");
          const parsed = JSON.parse(jsonStr);

          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield { content: text, done: false };
          }

          if (parsed.candidates?.[0]?.finishReason) {
            yield {
              content: "",
              done: true,
              usage: parsed.usageMetadata
                ? {
                    promptTokens: parsed.usageMetadata.promptTokenCount || 0,
                    completionTokens:
                      parsed.usageMetadata.candidatesTokenCount || 0,
                    totalTokens: parsed.usageMetadata.totalTokenCount || 0,
                  }
                : undefined,
            };
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream from Ollama API (local models)
 */
async function* streamOllama(
  config: LLMClientConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  const baseUrl = config.apiBase || DEFAULT_API_BASES.ollama;
  const url = `${baseUrl}/api/chat`;

  // Prepare messages with system prompt
  const allMessages = config.systemPrompt
    ? [{ role: "system" as const, content: config.systemPrompt }, ...messages]
    : messages;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: allMessages,
      options: {
        temperature: config.temperature,
        num_predict: config.maxTokens,
      },
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new LLMError(
      `Ollama API error: ${error}`,
      config.provider,
      response.status
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new LLMError("No response body", config.provider);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const parsed = JSON.parse(line);
          const content = parsed.message?.content;

          if (content) {
            yield { content, done: false };
          }

          if (parsed.done) {
            yield {
              content: "",
              done: true,
              usage: {
                promptTokens: parsed.prompt_eval_count || 0,
                completionTokens: parsed.eval_count || 0,
                totalTokens:
                  (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0),
              },
            };
            return;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-streaming chat completion (for simpler use cases)
 */
export async function chatCompletion(
  config: LLMClientConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<{ content: string; usage?: StreamChunk["usage"] }> {
  let content = "";
  let usage: StreamChunk["usage"] | undefined;

  for await (const chunk of streamChatCompletion(config, messages, signal)) {
    content += chunk.content;
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  return { content, usage };
}
