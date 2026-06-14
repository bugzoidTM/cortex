import { z } from "zod";
import { generateContentPackageArtifact } from "./llm-gateway";
import { prisma } from "./prisma";

export const createJobInputSchema = z.object({
  title: z.string().min(3).max(160),
  objective: z.string().min(3).max(240),
  primaryPlatform: z.string().min(2).max(80).default("multiplataforma"),
  context: z.string().min(3).max(4000),
  skill: z.string().min(2).max(80).default("pacote-conteudo"),
});

export type CreateJobInput = z.infer<typeof createJobInputSchema>;

const DEFAULT_MAX_JOB_INPUT_TOKENS = 2_500;

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly quotaStatus: TenantQuotaStatus,
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export type TenantQuotaStatus = {
  plan: string;
  monthlyQuota: number;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;
  estimatedJobTokens: number;
  maxJobInputTokens: number;
  canCreateJob: boolean;
  resetPeriod: string;
};

export function estimateJobTokenUsage(input: CreateJobInput) {
  return estimateTokens(JSON.stringify(input));
}

function getMaxJobInputTokens() {
  const configured = Number(process.env.CORTEX_MAX_JOB_INPUT_TOKENS ?? DEFAULT_MAX_JOB_INPUT_TOKENS.toString());
  if (!Number.isFinite(configured) || configured < 500) {
    return DEFAULT_MAX_JOB_INPUT_TOKENS;
  }
  return Math.floor(configured);
}

function getMonthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function getTenantQuotaStatus(tenantId: string, estimatedJobTokens = 0): Promise<TenantQuotaStatus> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const { start, end } = getMonthWindow();
  const usage = await prisma.lLMUsageLedger.aggregate({
    where: { tenantId, createdAt: { gte: start, lt: end } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  const usedTokens = (usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0);
  const remainingTokens = Math.max(0, tenant.monthlyQuota - usedTokens);
  const maxJobInputTokens = getMaxJobInputTokens();

  return {
    plan: tenant.plan,
    monthlyQuota: tenant.monthlyQuota,
    usedTokens,
    remainingTokens,
    usagePercent: tenant.monthlyQuota > 0 ? Math.min(100, Math.round((usedTokens / tenant.monthlyQuota) * 100)) : 100,
    estimatedJobTokens,
    maxJobInputTokens,
    canCreateJob: remainingTokens > 0 && estimatedJobTokens <= maxJobInputTokens,
    resetPeriod: start.toISOString().slice(0, 7),
  };
}

export async function assertTenantCanCreateJob(tenantId: string, input: CreateJobInput) {
  const estimatedJobTokens = estimateJobTokenUsage(input);
  const quotaStatus = await getTenantQuotaStatus(tenantId, estimatedJobTokens);

  if (estimatedJobTokens > quotaStatus.maxJobInputTokens) {
    throw new QuotaExceededError("job_input_token_limit_exceeded", quotaStatus);
  }

  if (quotaStatus.remainingTokens <= 0) {
    throw new QuotaExceededError("monthly_quota_exceeded", quotaStatus);
  }

  return quotaStatus;
}

export async function ensureDemoTenant() {
  return prisma.tenant.upsert({
    where: { slug: "nutef-demo" },
    update: {},
    create: {
      slug: "nutef-demo",
      name: "Nutef Demo",
      plan: "beta",
      monthlyQuota: 1_000_000,
      brandProfile: {
        create: {
          tone: "formal, técnico, humano, objetivo",
          audience: "empreendedores e equipes que precisam transformar ideias em conteúdo útil",
          promise: "gerar pacotes de conteúdo em PT-BR no tom da marca com aprovação humana",
          restrictions: ["sem jargão de guru", "sem promessas irreais", "sempre manter humano no circuito"],
          sampleContent: "Demonstrações práticas, linguagem clara e foco em resultado operacional.",
        },
      },
    },
    include: { brandProfile: true },
  });
}

export async function getMvpSnapshot(tenantId?: string) {
  const tenant = tenantId
    ? await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { brandProfile: true } })
    : await ensureDemoTenant();
  const [jobs, artifacts, usage, quotaStatus] = await Promise.all([
    prisma.skillJob.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { briefing: true, artifacts: true, usageLedger: true },
    }),
    prisma.artifact.count({ where: { tenantId: tenant.id } }),
    prisma.lLMUsageLedger.aggregate({
      where: { tenantId: tenant.id },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
    }),
    getTenantQuotaStatus(tenant.id),
  ]);

  return {
    tenant,
    jobs,
    metrics: {
      jobs: jobs.length,
      artifacts,
      inputTokens: usage._sum.inputTokens ?? 0,
      outputTokens: usage._sum.outputTokens ?? 0,
      costUsd: usage._sum.costUsd?.toString() ?? "0",
    },
    quotaStatus,
  };
}

export async function createContentPackageJob(input: CreateJobInput, tenantId?: string) {
  const parsed = createJobInputSchema.parse(input);
  const tenant = tenantId
    ? await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { brandProfile: true } })
    : await ensureDemoTenant();
  const preflightQuotaStatus = await assertTenantCanCreateJob(tenant.id, parsed);
  const generation = await generateContentPackageArtifact(parsed, tenant.brandProfile);

  return prisma.$transaction(async (tx) => {
    const briefing = await tx.briefing.create({
      data: {
        tenantId: tenant.id,
        title: parsed.title,
        objective: parsed.objective,
        primaryPlatform: parsed.primaryPlatform,
        context: parsed.context,
      },
    });

    const job = await tx.skillJob.create({
      data: {
        tenantId: tenant.id,
        briefingId: briefing.id,
        skill: parsed.skill,
        status: "COMPLETED",
        startedAt: new Date(),
        completedAt: new Date(),
        input: parsed,
        output: {
          summary: generation.summary,
          provider: generation.provider,
          model: generation.model,
          status: generation.status,
        },
      },
    });

    const artifact = await tx.artifact.create({
      data: {
        tenantId: tenant.id,
        jobId: job.id,
        type: "content_package",
        title: `Pacote: ${parsed.title}`,
        content: generation.content,
      },
    });

    const ledger = await tx.lLMUsageLedger.create({
      data: {
        tenantId: tenant.id,
        jobId: job.id,
        provider: generation.provider,
        model: generation.model,
        inputTokens: generation.inputTokens,
        outputTokens: generation.outputTokens,
        costUsd: generation.costUsd,
        latencyMs: generation.latencyMs,
        status: generation.status,
      },
    });

    return { tenant, briefing, job, artifact, ledger, quotaStatus: preflightQuotaStatus };
  });
}
