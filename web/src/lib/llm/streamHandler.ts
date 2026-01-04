/**
 * Stream handler for converting LLM provider responses to Onyx packet format
 *
 * This module bridges the gap between direct LLM API responses and the
 * Onyx streaming packet format used by the chat UI.
 */

import { streamChatCompletion, LLMClientConfig, ChatMessage as LLMChatMessage, StreamChunk, LLMError } from "./clientLLM";
import {
  Packet,
  MessageStart,
  MessageDelta,
  MessageEnd,
  Stop,
  StopReason,
  PacketError,
} from "@/app/chat/services/streamingModels";
import { PacketType } from "@/app/chat/services/lib";
import { Message } from "@/app/chat/interfaces";

/**
 * Convert Onyx Message format to LLM ChatMessage format
 */
export function convertMessagesToLLMFormat(messages: Message[]): LLMChatMessage[] {
  return messages
    .filter((m) => m.type === "user" || m.type === "assistant")
    .map((m) => ({
      role: m.type as "user" | "assistant",
      content: m.message,
    }));
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `enc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Stream chat completion and convert to Onyx packet format
 *
 * @param config - LLM configuration
 * @param messages - Chat history in Onyx Message format
 * @param newMessage - The new user message
 * @param signal - Optional AbortSignal for cancellation
 * @yields Onyx packet format objects
 */
export async function* streamChatAsOnyxPackets(
  config: LLMClientConfig,
  messages: Message[],
  newMessage: string,
  signal?: AbortSignal
): AsyncGenerator<PacketType, void, unknown> {
  const messageId = generateMessageId();
  let fullContent = "";
  let turnIndex = 0;

  // Convert existing messages to LLM format
  const llmMessages = convertMessagesToLLMFormat(messages);

  // Add the new user message
  llmMessages.push({
    role: "user",
    content: newMessage,
  });

  try {
    // Yield message start packet
    const startPacket: Packet = {
      placement: { turn_index: turnIndex },
      obj: {
        type: "message_start",
        id: messageId,
        content: "",
        final_documents: null,
      } as MessageStart,
    };
    yield startPacket;

    // Stream the response
    for await (const chunk of streamChatCompletion(config, llmMessages, signal)) {
      if (chunk.content) {
        fullContent += chunk.content;

        // Yield message delta packet
        const deltaPacket: Packet = {
          placement: { turn_index: turnIndex },
          obj: {
            type: "message_delta",
            content: chunk.content,
          } as MessageDelta,
        };
        yield deltaPacket;
      }

      if (chunk.done) {
        // Yield message end packet
        const endPacket: Packet = {
          placement: { turn_index: turnIndex },
          obj: {
            type: "message_end",
          } as MessageEnd,
        };
        yield endPacket;

        // Yield stop packet
        const stopPacket: Packet = {
          placement: { turn_index: turnIndex },
          obj: {
            type: "stop",
            stop_reason: StopReason.FINISHED,
          } as Stop,
        };
        yield stopPacket;
      }
    }
  } catch (error) {
    // Handle cancellation
    if (error instanceof DOMException && error.name === "AbortError") {
      const stopPacket: Packet = {
        placement: { turn_index: turnIndex },
        obj: {
          type: "stop",
          stop_reason: StopReason.USER_CANCELLED,
        } as Stop,
      };
      yield stopPacket;
      return;
    }

    // Handle LLM errors
    const errorMessage = error instanceof LLMError
      ? `${error.provider} error: ${error.message}`
      : error instanceof Error
        ? error.message
        : "Unknown error occurred";

    const errorPacket: Packet = {
      placement: { turn_index: turnIndex },
      obj: {
        type: "error",
        message: errorMessage,
      } as PacketError,
    };
    yield errorPacket;
  }
}

/**
 * Parameters for sending an encrypted message
 */
export interface EncryptedSendParams {
  /** The new message to send */
  message: string;
  /** Existing chat history */
  chatHistory: Message[];
  /** LLM configuration (with decrypted API key) */
  llmConfig: LLMClientConfig;
  /** Optional abort signal */
  signal?: AbortSignal;
}

/**
 * Send a message in encrypted mode (direct to LLM)
 *
 * This is the main entry point for encrypted mode chat.
 * It calls the LLM directly and returns packets in Onyx format.
 *
 * @param params - Send parameters
 * @yields Onyx packet format objects
 */
export async function* sendMessageEncrypted({
  message,
  chatHistory,
  llmConfig,
  signal,
}: EncryptedSendParams): AsyncGenerator<PacketType, void, unknown> {
  yield* streamChatAsOnyxPackets(llmConfig, chatHistory, message, signal);
}

/**
 * Build an LLM config from encrypted mode settings
 */
export function buildLLMConfig(
  provider: LLMClientConfig["provider"],
  modelName: string,
  apiKey: string,
  options?: {
    apiBase?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }
): LLMClientConfig {
  return {
    provider,
    modelName,
    apiKey,
    apiBase: options?.apiBase,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens,
    systemPrompt: options?.systemPrompt,
  };
}
