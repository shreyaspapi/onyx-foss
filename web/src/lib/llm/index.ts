/**
 * Client-side LLM module for encrypted chat
 *
 * Provides direct LLM API access from the browser for end-to-end encrypted chat.
 */

export {
  streamChatCompletion,
  chatCompletion,
  LLMError,
  DEFAULT_API_BASES,
  type LLMProvider,
  type LLMClientConfig,
  type ChatMessage,
  type StreamChunk,
} from "./clientLLM";

export {
  streamChatAsOnyxPackets,
  sendMessageEncrypted,
  convertMessagesToLLMFormat,
  buildLLMConfig,
  type EncryptedSendParams,
} from "./streamHandler";
