import { existsSync, readFileSync } from "node:fs";

export function readSecretEnv(name: string) {
  const directValue = process.env[name];
  if (directValue && directValue.trim()) {
    return directValue.trim();
  }

  const filePath = process.env[`${name}_FILE`];
  if (!filePath || !filePath.trim() || !existsSync(filePath)) {
    return undefined;
  }

  const fileValue = readFileSync(filePath, "utf8").trim();
  return fileValue || undefined;
}

export function getLlmRuntimeStatus() {
  const apiKey = readSecretEnv("OPENAI_COMPATIBLE_API_KEY");
  const openaiCompatibleApiKeyFile = process.env.OPENAI_COMPATIBLE_API_KEY_FILE;
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;
  const model = process.env.OPENAI_COMPATIBLE_MODEL ?? "gpt-4o-mini";
  const provider = process.env.OPENAI_COMPATIBLE_PROVIDER ?? "openai-compatible";

  return {
    configured: Boolean(apiKey && baseUrl),
    provider,
    model,
    maskedBaseUrl: maskBaseUrl(baseUrl),
    hasApiKey: Boolean(apiKey),
    hasApiKeyFile: Boolean(openaiCompatibleApiKeyFile),
    apiKeySource: apiKey ? (process.env.OPENAI_COMPATIBLE_API_KEY ? "env" : "file") : "missing",
    fallbackProvider: "internal-mvp",
    fallbackModel: "deterministic-template-v1",
  };
}

function maskBaseUrl(baseUrl: string | undefined) {
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "invalid-url";
  }
}
