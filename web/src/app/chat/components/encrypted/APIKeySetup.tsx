"use client";

import { useState, useCallback, useEffect } from "react";
import Modal from "@/refresh-components/Modal";
import Button from "@/refresh-components/buttons/Button";
import { SvgKey } from "@opal/icons";
import { LLMProvider } from "@/lib/llm/clientLLM";
import { storeEncryptedLLMConfig } from "@/lib/crypto/apiKeyManager";
import { getKeyManager } from "@/lib/crypto/keyManager";

export interface APIKeySetupProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when setup is complete */
  onComplete: () => void;
  /** Callback when dialog is cancelled */
  onCancel: () => void;
  /** The user's encryption password (for encrypting the API key) */
  password: string;
}

interface ProviderOption {
  id: LLMProvider;
  name: string;
  placeholder: string;
  defaultModel: string;
  models: string[];
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: "openai",
    name: "OpenAI",
    placeholder: "sk-...",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    placeholder: "sk-ant-...",
    defaultModel: "claude-sonnet-4-20250514",
    models: [
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
  },
  {
    id: "google",
    name: "Google Gemini",
    placeholder: "AIza...",
    defaultModel: "gemini-1.5-pro",
    models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    placeholder: "Your Azure API key",
    defaultModel: "",
    models: [],
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    placeholder: "No API key needed",
    defaultModel: "llama3.2",
    models: ["llama3.2", "llama3.1", "mistral", "codellama"],
  },
];

export default function APIKeySetup({
  isOpen,
  onComplete,
  onCancel,
  password,
}: APIKeySetupProps) {
  const [provider, setProvider] = useState<LLMProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get current provider config
  const providerConfig = PROVIDER_OPTIONS.find((p) => p.id === provider)!;

  // Reset form when provider changes
  useEffect(() => {
    setApiKey("");
    setModelName(providerConfig.defaultModel);
    setCustomModel("");
    setApiBase("");
    setError(null);
  }, [provider, providerConfig.defaultModel]);

  // Clear state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setProvider("openai");
      setApiKey("");
      setModelName(PROVIDER_OPTIONS[0].defaultModel);
      setCustomModel("");
      setApiBase("");
      setTemperature(0.7);
      setError(null);
      setShowAdvanced(false);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    setError(null);

    // Validate
    if (provider !== "ollama" && !apiKey.trim()) {
      setError("API key is required");
      return;
    }

    const finalModel = customModel.trim() || modelName;
    if (!finalModel) {
      setError("Model name is required");
      return;
    }

    setIsLoading(true);

    try {
      // Store the encrypted config
      await storeEncryptedLLMConfig(
        {
          provider,
          modelName: finalModel,
          apiBase: apiBase.trim() || undefined,
          temperature,
          apiKey: apiKey.trim() || "none",
        },
        password
      );

      onComplete();
    } catch (err) {
      console.error("Failed to store API key:", err);
      setError(err instanceof Error ? err.message : "Failed to store API key");
    } finally {
      setIsLoading(false);
    }
  }, [
    provider,
    apiKey,
    modelName,
    customModel,
    apiBase,
    temperature,
    password,
    onComplete,
  ]);

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <Modal.Content>
        <Modal.Header
          icon={SvgKey}
          title="Set Up LLM API Key"
          onClose={onCancel}
        />

        <Modal.Body className="flex flex-col gap-4 p-4">
          <p className="text-sm text-text-muted">
            Configure your LLM provider for encrypted chat. Your API key will be
            encrypted with your password and stored securely.
          </p>

          {/* Provider Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setProvider(opt.id)}
                  className={`px-3 py-2 text-sm border rounded-md transition-colors ${
                    provider === opt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key Input */}
          {provider !== "ollama" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError(null);
                }}
                placeholder={providerConfig.placeholder}
                className="px-3 py-2 border rounded-md bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Model Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Model</label>
            {providerConfig.models.length > 0 ? (
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {providerConfig.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                <option value="custom">Custom model...</option>
              </select>
            ) : (
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Enter model name"
                className="px-3 py-2 border rounded-md bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}

            {modelName === "custom" && (
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Enter custom model name"
                className="px-3 py-2 border rounded-md bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary mt-2"
              />
            )}
          </div>

          {/* Advanced Settings */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-primary hover:underline"
            >
              {showAdvanced ? "Hide" : "Show"} advanced settings
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 p-3 bg-background-tint-01 rounded-md">
                {/* Temperature */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">
                    Temperature: {temperature.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) =>
                      setTemperature(parseFloat(e.target.value))
                    }
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>

                {/* Custom API Base */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">
                    Custom API Base URL (optional)
                  </label>
                  <input
                    type="text"
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    placeholder={
                      provider === "ollama"
                        ? "http://localhost:11434"
                        : "Leave blank for default"
                    }
                    className="px-3 py-2 border rounded-md bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Security Note */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-blue-700">
              Your API key will be encrypted with your password before being
              stored. It will only be decrypted in your browser when needed.
            </p>
          </div>
        </Modal.Body>

        <Modal.Footer className="flex flex-row p-4 items-center justify-end w-full gap-2">
          <Button onClick={onCancel} secondary disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save API Key"}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal>
  );
}
