import { getActiveLlmProviderConfig } from "./llm-provider-config";
import { readSecretEnv } from "./runtime-config";
import { getActiveTenantLlmCredential } from "./tenant-llm-credential";
import type { CreateJobInput } from "./cortex-mvp";

type BrandContext = {
  tone?: string | null;
  audience?: string | null;
  promise?: string | null;
  restrictions?: string[] | null;
  sampleContent?: string | null;
};

// Falha transitória do provider (HTTP, timeout, resposta vazia): o job volta para a fila
// e tenta de novo em vez de entregar template enlatado como se fosse sucesso.
export class LlmGenerationError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "LlmGenerationError";
  }
}

type GatewayResult = {
  content: string;
  summary: string;
  provider: string;
  model: string;
  llmProviderConfigId: string | null;
  inputTokens: number;
  outputTokens: number;
  inputCostPer1M: string;
  outputCostPer1M: string;
  costUsd: string;
  latencyMs: number;
  status: "completed" | "fallback";
};

type OpenAICompatibleResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

const DEFAULT_MODEL = "deterministic-template-v1";

export async function generateContentPackageArtifact(
  input: CreateJobInput,
  brand?: BrandContext | null,
  tenantId?: string | null,
): Promise<GatewayResult> {
  const startedAt = Date.now();
  const credential = await getActiveTenantLlmCredential(tenantId);
  const config = await getActiveLlmProviderConfig(tenantId);
  const apiKey = credential?.apiKey ?? readSecretEnv("OPENAI_COMPATIBLE_API_KEY");
  const runtime = credential?.trialActive
    ? {
        provider: credential.provider,
        baseUrl: credential?.baseUrl,
        model: credential.model,
        maxOutputTokens: config?.maxOutputTokens ?? 1800,
        timeoutMs: config?.timeoutMs ?? 180000,
        inputCostPer1M: "0",
        outputCostPer1M: "0",
        llmProviderConfigId: null as string | null,
        byokTrial: credential.byokTrial,
      }
    : config
      ? {
          provider: config.provider,
          baseUrl: config.baseUrl,
          model: config.model,
          maxOutputTokens: config.maxOutputTokens,
          timeoutMs: config.timeoutMs,
          inputCostPer1M: config.inputCostPer1M,
          outputCostPer1M: config.outputCostPer1M,
          llmProviderConfigId: config.id,
          byokTrial: false,
        }
      : null;

  if (!apiKey || !runtime?.baseUrl) {
    return deterministicFallback(input, brand, Date.now() - startedAt, "missing_openai_compatible_config");
  }

  const messages = buildMessages(input, brand);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs(runtime.timeoutMs));

  try {
    const response = await fetch(`${runtime.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: runtime.model,
        temperature: 0.7,
        max_tokens: getMaxOutputTokens(runtime.maxOutputTokens),
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new LlmGenerationError(`openai_compatible_http_${response.status}`);
    }

    const payload = (await response.json()) as OpenAICompatibleResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new LlmGenerationError("empty_openai_compatible_content");
    }

    const promptTokens = payload.usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages));
    const completionTokens = payload.usage?.completion_tokens ?? estimateTokens(content);

    return {
      content,
      summary: "Pacote gerado via LLM Gateway OpenAI-compatible.",
      provider: runtime.byokTrial ? `${runtime.provider}-byokTrial` : runtime.provider,
      model: runtime.model,
      llmProviderConfigId: runtime.llmProviderConfigId,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      inputCostPer1M: runtime.inputCostPer1M,
      outputCostPer1M: runtime.outputCostPer1M,
      costUsd: estimateCostUsd(promptTokens, completionTokens, runtime.inputCostPer1M, runtime.outputCostPer1M),
      latencyMs: Date.now() - startedAt,
      status: "completed",
    };
  } catch (error) {
    if (error instanceof LlmGenerationError) {
      throw error;
    }
    const reason = controller.signal.aborted ? "openai_compatible_timeout" : "openai_compatible_exception";
    throw new LlmGenerationError(reason);
  } finally {
    clearTimeout(timeout);
  }
}

function getTimeoutMs(configured: number) {
  if (!Number.isFinite(configured) || configured < 1000) {
    return 60000;
  }
  return Math.min(Math.floor(configured), 300000);
}

function buildMessages(input: CreateJobInput, brand?: BrandContext | null) {
  return [
    {
      role: "system",
      content: [
        "Você é o Cortex, um gerador de pacotes de conteúdo para negócios brasileiros.",
        "Responda sempre em português brasileiro.",
        "Entregue um artifact em Markdown, prático, revisável por humano e sem promessas exageradas.",
        brand?.tone ? `Tom da marca: ${brand.tone}` : null,
        brand?.audience ? `Público: ${brand.audience}` : null,
        brand?.promise ? `Promessa central: ${brand.promise}` : null,
        brand?.restrictions?.length ? `Restrições: ${brand.restrictions.join("; ")}` : null,
        brand?.sampleContent
          ? `Exemplo de conteúdo aprovado pela marca (use como referência de estilo, não copie):\n${brand.sampleContent.slice(0, 1500)}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: [
        `Tema: ${input.title}`,
        `Objetivo: ${input.objective}`,
        `Plataforma prioritária: ${input.primaryPlatform}`,
        `Contexto estratégico: ${input.context}`,
        "",
        "Gere, nesta ordem e com um título de seção Markdown para cada item:",
        "1. Um post LinkedIn completo.",
        "2. Um roteiro curto para Reels/TikTok.",
        "3. Um outline de carrossel.",
        "4. Três legendas curtas.",
        "5. Cinco ganchos alternativos de abertura.",
        "6. Um e-mail/newsletter curto.",
        "7. Checklist de publicação.",
        "8. Observações de revisão humana.",
      ].join("\n"),
    },
  ];
}

function deterministicFallback(input: CreateJobInput, brand: BrandContext | null | undefined, latencyMs: number, reason: string): GatewayResult {
  const content = [
    `# Pacote de conteúdo — ${input.title}`,
    "",
    `Objetivo: ${input.objective}`,
    `Plataforma prioritária: ${input.primaryPlatform}`,
    brand?.tone ? `Tom aplicado: ${brand.tone}` : "Tom aplicado: formal, técnico, humano e objetivo",
    "",
    "## Post LinkedIn",
    `Ideia central: ${input.context}`,
    "",
    "Use IA como alavanca prática: comece por uma rotina repetitiva, defina o resultado esperado e mantenha revisão humana antes de publicar.",
    "",
    "## Roteiro Reels/TikTok",
    "- Gancho: Sua empresa não precisa de mais ferramentas; precisa de um fluxo claro.",
    "- Desenvolvimento: mostre uma tarefa antes/depois com IA.",
    "- CTA: escolha uma rotina e transforme em processo esta semana.",
    "",
    "## Carrossel em outline",
    "1. O problema: conteúdo inconsistente.",
    "2. A virada: briefing simples + voz da marca.",
    "3. O processo: gerar, revisar, aprovar, publicar.",
    "4. O controle: medir custo, tempo e qualidade.",
    "5. Próximo passo: testar com uma campanha pequena.",
    "",
    "## 3 legendas curtas",
    "- IA boa começa com contexto bom.",
    "- Automatize o rascunho, não a responsabilidade.",
    "- Conteúdo escalável precisa de processo, não improviso.",
    "",
    "## E-mail/newsletter",
    "Assunto: Como transformar uma ideia em conteúdo da semana",
    "",
    "Pegue uma ideia, defina público e objetivo, gere variações por canal e revise antes de publicar. Esse é o caminho simples para escalar conteúdo sem perder o tom da marca.",
    "",
    "## Revisão humana",
    "Validar exemplos, promessas, tom e CTA antes de exportar.",
  ].join("\n");

  return {
    content,
    summary: `Pacote gerado por fallback determinístico do LLM Gateway (${reason}).`,
    provider: "internal-mvp",
    model: DEFAULT_MODEL,
    llmProviderConfigId: null,
    // Conteúdo enlatado não consome a quota do cliente: os tokens só contam em geração real.
    inputTokens: 0,
    outputTokens: 0,
    inputCostPer1M: "0",
    outputCostPer1M: "0",
    costUsd: "0",
    latencyMs,
    status: "fallback",
  };
}

function getMaxOutputTokens(configured: number) {
  if (!Number.isFinite(configured) || configured < 256) {
    return 1800;
  }
  return Math.min(Math.floor(configured), 8000);
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCostUsd(inputTokens: number, outputTokens: number, inputCostPer1M: string, outputCostPer1M: string) {
  const inputPerMillion = Number(inputCostPer1M || "0");
  const outputPerMillion = Number(outputCostPer1M || "0");
  const cost = (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
  return cost.toFixed(6);
}
