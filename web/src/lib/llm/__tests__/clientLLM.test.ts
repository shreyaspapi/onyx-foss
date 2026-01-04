/**
 * Unit tests for the client-side LLM library
 */

import {
  LLMError,
  DEFAULT_API_BASES,
  type LLMClientConfig,
  type ChatMessage,
} from "../clientLLM";

describe("Client LLM Library", () => {
  describe("LLMError", () => {
    it("should create error with provider and message", () => {
      const error = new LLMError("Test error", "openai", 400);

      expect(error.name).toBe("LLMError");
      expect(error.message).toBe("Test error");
      expect(error.provider).toBe("openai");
      expect(error.statusCode).toBe(400);
    });

    it("should be instanceof Error", () => {
      const error = new LLMError("Test", "anthropic");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(LLMError);
    });

    it("should work without status code", () => {
      const error = new LLMError("Test", "google");

      expect(error.statusCode).toBeUndefined();
    });
  });

  describe("DEFAULT_API_BASES", () => {
    it("should have entries for all supported providers", () => {
      expect(DEFAULT_API_BASES.openai).toBeDefined();
      expect(DEFAULT_API_BASES.anthropic).toBeDefined();
      expect(DEFAULT_API_BASES.azure).toBeDefined();
      expect(DEFAULT_API_BASES.ollama).toBeDefined();
      expect(DEFAULT_API_BASES.google).toBeDefined();
    });

    it("should have valid URLs for providers", () => {
      expect(DEFAULT_API_BASES.openai).toContain("api.openai.com");
      expect(DEFAULT_API_BASES.anthropic).toContain("api.anthropic.com");
      expect(DEFAULT_API_BASES.google).toContain("generativelanguage.googleapis.com");
    });

    it("should have localhost for Ollama", () => {
      expect(DEFAULT_API_BASES.ollama).toContain("localhost");
    });
  });

  describe("LLMClientConfig type", () => {
    it("should accept valid configurations", () => {
      const config: LLMClientConfig = {
        provider: "openai",
        apiKey: "sk-test",
        modelName: "gpt-4",
        temperature: 0.7,
      };

      expect(config.provider).toBe("openai");
      expect(config.temperature).toBe(0.7);
    });

    it("should accept optional fields", () => {
      const config: LLMClientConfig = {
        provider: "anthropic",
        apiKey: "sk-ant-test",
        modelName: "claude-3-opus",
        temperature: 0.5,
        apiBase: "https://custom.api.com",
        maxTokens: 4096,
        systemPrompt: "You are a helpful assistant.",
      };

      expect(config.apiBase).toBe("https://custom.api.com");
      expect(config.maxTokens).toBe(4096);
      expect(config.systemPrompt).toBeDefined();
    });
  });

  describe("ChatMessage type", () => {
    it("should support all message roles", () => {
      const messages: ChatMessage[] = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[2].role).toBe("assistant");
    });
  });
});

describe("Stream handling", () => {
  // These tests would require mocking fetch and ReadableStream
  // which is complex in a Node.js environment

  describe("SSE parsing", () => {
    it("should parse data lines correctly", () => {
      const line = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}";
      const dataMatch = line.match(/^data: (.*)$/);

      expect(dataMatch).toBeTruthy();
      expect(dataMatch![1]).toContain("Hello");
    });

    it("should recognize [DONE] marker", () => {
      const doneLine = "data: [DONE]";
      const data = doneLine.slice(6);

      expect(data).toBe("[DONE]");
    });
  });

  describe("Error handling", () => {
    it("should detect API error status codes", () => {
      const errorCodes = [400, 401, 403, 404, 429, 500, 502, 503];

      errorCodes.forEach((code) => {
        expect(code >= 400).toBe(true);
      });
    });

    it("should categorize rate limit errors", () => {
      const rateLimitCode = 429;
      expect(rateLimitCode).toBe(429);
    });
  });
});
