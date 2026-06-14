import { z } from "zod";
import { prisma } from "./prisma";

export const createJobInputSchema = z.object({
  title: z.string().min(3).max(160),
  objective: z.string().min(3).max(240),
  primaryPlatform: z.string().min(2).max(80).default("multiplataforma"),
  context: z.string().min(3).max(4000),
  skill: z.string().min(2).max(80).default("pacote-conteudo"),
});

export type CreateJobInput = z.infer<typeof createJobInputSchema>;

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

export async function getMvpSnapshot() {
  const tenant = await ensureDemoTenant();
  const [jobs, artifacts, usage] = await Promise.all([
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
  };
}

export async function createContentPackageJob(input: CreateJobInput) {
  const parsed = createJobInputSchema.parse(input);
  const tenant = await ensureDemoTenant();

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
          summary: "Pacote MVP gerado em modo determinístico para validar fluxo de dados real.",
          items: ["Post LinkedIn", "Roteiro Reels/TikTok", "Carrossel outline", "Legendas curtas", "E-mail/newsletter"],
        },
      },
    });

    const artifact = await tx.artifact.create({
      data: {
        tenantId: tenant.id,
        jobId: job.id,
        type: "content_package",
        title: `Pacote: ${parsed.title}`,
        content: [
          `# Pacote de conteúdo — ${parsed.title}`,
          "",
          `Objetivo: ${parsed.objective}`,
          `Plataforma prioritária: ${parsed.primaryPlatform}`,
          "",
          "## Entregáveis",
          "- Post LinkedIn",
          "- Roteiro Reels/TikTok",
          "- Carrossel em outline",
          "- 3 legendas curtas",
          "- E-mail/newsletter",
        ].join("\n"),
      },
    });

    const ledger = await tx.lLMUsageLedger.create({
      data: {
        tenantId: tenant.id,
        jobId: job.id,
        provider: "internal-mvp",
        model: "deterministic-template-v1",
        inputTokens: Math.ceil(JSON.stringify(parsed).length / 4),
        outputTokens: Math.ceil(artifact.content.length / 4),
        costUsd: "0",
        latencyMs: 0,
        status: "completed",
      },
    });

    return { tenant, briefing, job, artifact, ledger };
  });
}
