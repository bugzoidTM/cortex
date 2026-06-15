import { z } from "zod";
import { notifyAlert } from "./alerts";
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
const MAX_WORKER_ATTEMPTS = 3;

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

export async function enqueueContentPackageJob(input: CreateJobInput, tenantId?: string) {
  const parsed = createJobInputSchema.parse(input);
  const tenant = tenantId
    ? await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { brandProfile: true } })
    : await ensureDemoTenant();
  const quotaStatus = await assertTenantCanCreateJob(tenant.id, parsed);

  const result = await prisma.$transaction(async (tx) => {
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
        status: "PENDING",
        input: parsed,
      },
    });

    return { briefing, job };
  });

  return { tenant, briefing: result.briefing, job: result.job, quotaStatus };
}

export async function processNextContentPackageJob() {
  const job = await prisma.skillJob.findFirst({
    where: { status: "PENDING", attempts: { lt: MAX_WORKER_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
  });

  if (!job) {
    return null;
  }

  const claimed = await prisma.skillJob.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: { status: "PROCESSING", lockedAt: new Date(), startedAt: new Date(), attempts: { increment: 1 }, error: null },
  });

  if (claimed.count !== 1) {
    return null;
  }

  return processContentPackageJob(job.id);
}

export async function processContentPackageJob(jobId: string) {
  const job = await prisma.skillJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { tenant: { include: { brandProfile: true } }, briefing: true },
  });

  const parsed = createJobInputSchema.parse(job.input);

  try {
    const generation = await generateContentPackageArtifact(parsed, job.tenant.brandProfile, job.tenantId);

    return prisma.$transaction(async (tx) => {
      const updatedJob = await tx.skillJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
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
          tenantId: job.tenantId,
          jobId: job.id,
          type: "content_package",
          title: `Pacote: ${parsed.title}`,
          content: generation.content,
        },
      });

      const ledger = await tx.lLMUsageLedger.create({
        data: {
          tenantId: job.tenantId,
          jobId: job.id,
          provider: generation.provider,
          model: generation.model,
          llmProviderConfigId: generation.llmProviderConfigId,
          inputTokens: generation.inputTokens,
          outputTokens: generation.outputTokens,
          inputCostPer1M: generation.inputCostPer1M,
          outputCostPer1M: generation.outputCostPer1M,
          costUsd: generation.costUsd,
          latencyMs: generation.latencyMs,
          status: generation.status,
        },
      });

      return { job: updatedJob, artifact, ledger };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_unknown_error";
    // Erros transitórios voltam para a fila enquanto houver tentativas; só falham de vez ao esgotar.
    const canRetry = job.attempts < MAX_WORKER_ATTEMPTS;
    const failed = await prisma.skillJob.update({
      where: { id: job.id },
      data: canRetry
        ? { status: "PENDING", error: message, lockedAt: null }
        : { status: "FAILED", error: message, completedAt: new Date(), lockedAt: null },
    });
    if (!canRetry) {
      await notifyAlert(`Job ${job.id} falhou após ${job.attempts} tentativas`, {
        tenantId: job.tenantId,
        skill: job.skill,
        error: message,
      });
    }
    return { job: failed, artifact: null, ledger: null };
  }
}

export async function createContentPackageJob(input: CreateJobInput, tenantId?: string) {
  const enqueued = await enqueueContentPackageJob(input, tenantId);
  const processed = await processContentPackageJob(enqueued.job.id);
  return { ...enqueued, ...processed };
}
