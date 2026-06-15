import { readSecretEnv } from "./runtime-config";
import { prisma } from "./prisma";

export type ActiveLlmProviderConfig = {
  id: string | null;
  provider: string;
  baseUrl: string;
  model: string;
  inputCostPer1M: string;
  outputCostPer1M: string;
  maxOutputTokens: number;
  timeoutMs: number;
  source: "database" | "env";
};

const ENV_FALLBACK_CONFIG: ActiveLlmProviderConfig = {
  id: null,
  provider: process.env.OPENAI_COMPATIBLE_PROVIDER ?? "openai-compatible",
  baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL ?? "",
  model: process.env.OPENAI_COMPATIBLE_MODEL ?? "gpt-4o-mini",
  inputCostPer1M: process.env.OPENAI_COMPATIBLE_INPUT_COST_PER_1M ?? "0",
  outputCostPer1M: process.env.OPENAI_COMPATIBLE_OUTPUT_COST_PER_1M ?? "0",
  maxOutputTokens: parsePositiveInt(process.env.OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS, 1800, 8000),
  timeoutMs: parsePositiveInt(process.env.OPENAI_COMPATIBLE_TIMEOUT_MS, 60000, 300000),
  source: "env",
};

export async function getActiveLlmProviderConfig(tenantId?: string | null): Promise<ActiveLlmProviderConfig | null> {
  try {
    const config =
      (tenantId
        ? await prisma.lLMProviderConfig.findFirst({
            where: { tenantId, enabled: true },
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          })
        : null) ??
      (await prisma.lLMProviderConfig.findFirst({
        where: { tenantId: null, enabled: true, isDefault: true },
        orderBy: { updatedAt: "desc" },
      })) ??
      (await prisma.lLMProviderConfig.findFirst({
        where: { tenantId: null, enabled: true },
        orderBy: { updatedAt: "desc" },
      }));

    if (!config) {
      return ENV_FALLBACK_CONFIG.baseUrl ? ENV_FALLBACK_CONFIG : null;
    }

    return {
      id: config.id,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      inputCostPer1M: config.inputCostPer1M.toString(),
      outputCostPer1M: config.outputCostPer1M.toString(),
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      source: "database",
    };
  } catch {
    return ENV_FALLBACK_CONFIG.baseUrl ? ENV_FALLBACK_CONFIG : null;
  }
}

export async function getLlmRuntimeStatus() {
  const apiKey = readSecretEnv("OPENAI_COMPATIBLE_API_KEY");
  const openaiCompatibleApiKeyFile = process.env.OPENAI_COMPATIBLE_API_KEY_FILE;
  const config = await getActiveLlmProviderConfig();

  return {
    configured: Boolean(apiKey && config?.baseUrl),
    provider: config?.provider ?? "missing",
    model: config?.model ?? "missing",
    configSource: config?.source ?? "missing",
    configId: config?.id,
    maskedBaseUrl: maskBaseUrl(config?.baseUrl),
    hasApiKey: Boolean(apiKey),
    hasApiKeyFile: Boolean(openaiCompatibleApiKeyFile),
    apiKeySource: apiKey ? (process.env.OPENAI_COMPATIBLE_API_KEY ? "env" : "file") : "missing",
    maxOutputTokens: config?.maxOutputTokens ?? null,
    timeoutMs: config?.timeoutMs ?? null,
    inputCostPer1M: config?.inputCostPer1M ?? "0",
    outputCostPer1M: config?.outputCostPer1M ?? "0",
    fallbackProvider: "internal-mvp",
    fallbackModel: "deterministic-template-v1",
  };
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
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
