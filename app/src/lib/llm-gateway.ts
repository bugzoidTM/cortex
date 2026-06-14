import { readSecretEnv } from "./runtime-config";
import type { CreateJobInput } from "./cortex-mvp";

type BrandContext = {
  tone?: string | null;
  audience?: string | null;
  promise?: string | null;
  restrictions?: string[] | null;
};

type GatewayResult = {
  content: string;
  summary: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
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

export async function generateContentPackageArtifact(input: CreateJobInput, brand?: BrandContext | null): Promise<GatewayResult> {
  const startedAt = Date.now();
  const apiKey = readSecretEnv("OPENAI_COMPATIBLE_API_KEY");
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;
  const model = process.env.OPENAI_COMPATIBLE_MODEL ?? "gpt-4o-mini";
  const provider = process.env.OPENAI_COMPATIBLE_PROVIDER ?? "openai-compatible";

  if (!apiKey || !baseUrl) {
    return deterministicFallback(input, brand, Date.now() - startedAt, "missing_openai_compatible_config");
  }

  const messages = buildMessages(input, brand);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: getMaxOutputTokens(),
        messages,
      }),
    });

    if (!response.ok) {
      return deterministicFallback(input, brand, Date.now() - startedAt, `openai_compatible_http_${response.status}`);
    }

    const payload = (await response.json()) as OpenAICompatibleResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return deterministicFallback(input, brand, Date.now() - startedAt, "empty_openai_compatible_content");
    }

    const promptTokens = payload.usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages));
    const completionTokens = payload.usage?.completion_tokens ?? estimateTokens(content);

    return {
      content,
      summary: "Pacote gerado via LLM Gateway OpenAI-compatible.",
      provider,
      model,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: estimateCostUsd(promptTokens, completionTokens),
      latencyMs: Date.now() - startedAt,
      status: "completed",
    };
  } catch {
    return deterministicFallback(input, brand, Date.now() - startedAt, "openai_compatible_exception");
  }
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
        "Gere:",
        "1. Um post LinkedIn completo.",
        "2. Um roteiro curto para Reels/TikTok.",
        "3. Um outline de carrossel.",
        "4. Três legendas curtas.",
        "5. Um e-mail/newsletter curto.",
        "6. Observações de revisão humana.",
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
    inputTokens: estimateTokens(JSON.stringify(input)),
    outputTokens: estimateTokens(content),
    costUsd: "0",
    latencyMs,
    status: "fallback",
  };
}

function getMaxOutputTokens() {
  const configured = Number(process.env.OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS ?? "1800");
  if (!Number.isFinite(configured) || configured < 256) {
    return 1800;
  }
  return Math.min(Math.floor(configured), 8000);
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCostUsd(inputTokens: number, outputTokens: number) {
  const inputPerMillion = Number(process.env.OPENAI_COMPATIBLE_INPUT_COST_PER_1M ?? "0");
  const outputPerMillion = Number(process.env.OPENAI_COMPATIBLE_OUTPUT_COST_PER_1M ?? "0");
  const cost = (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
  return cost.toFixed(6);
}
