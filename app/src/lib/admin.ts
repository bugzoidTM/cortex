import { z } from "zod";
import { hashPassword } from "./auth";
import { prisma } from "./prisma";

export const createTenantSchema = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(120),
  plan: z.string().min(2).max(40).default("beta"),
  monthlyQuota: z.coerce.number().int().min(1_000).max(100_000_000).default(1_000_000),
});

export const updateTenantSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(2).max(120).optional(),
  plan: z.string().min(2).max(40).optional(),
  monthlyQuota: z.coerce.number().int().min(1_000).max(100_000_000).optional(),
});

export const createUserSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(2).max(120).optional(),
  password: z.string().min(12).max(160),
  role: z.string().min(2).max(40).default("owner"),
});

export const upsertModelConfigSchema = z.object({
  id: z.string().min(1).optional(),
  tenantId: z.string().min(1).nullable().optional(),
  name: z.string().min(2).max(120).default("default"),
  provider: z.string().min(2).max(80),
  baseUrl: z.string().url(),
  model: z.string().min(2).max(120),
  inputCostPer1M: z.coerce.number().min(0).max(1000).default(0),
  outputCostPer1M: z.coerce.number().min(0).max(1000).default(0),
  maxOutputTokens: z.coerce.number().int().min(256).max(8000).default(1800),
  timeoutMs: z.coerce.number().int().min(1000).max(300000).default(180000),
  enabled: z.coerce.boolean().default(true),
  isDefault: z.coerce.boolean().default(true),
});

export const PRODUCTION_READINESS_ITEMS = [
  {
    status: "done",
    title: "Auth, sessão e tenant real",
    detail: "Login com cookie HTTP-only, User/Session/TenantMembership e rotas protegidas por tenant.",
  },
  {
    status: "done",
    title: "LLM real configurado",
    detail: "Provider OpenAI-compatible via Docker secret file e /api/runtime sanitizado.",
  },
  {
    status: "done",
    title: "Controle de margem por quota",
    detail: "Quota mensal por tenant, limite de entrada por execução e max_tokens no provider.",
  },
  {
    status: "needed",
    title: "Jobs assíncronos e worker",
    detail: "Tirar execução longa do request HTTP; criar fila/worker com retry, timeout e estados PENDING/PROCESSING/FAILED.",
  },
  {
    status: "needed",
    title: "Rate limit e antiabuso",
    detail: "Limitar login e criação de jobs por IP/usuário/tenant para proteger custo e disponibilidade.",
  },
  {
    status: "needed",
    title: "Backup e restore PostgreSQL",
    detail: "Backup diário automatizado, retenção, teste documentado de restore e alerta de falha.",
  },
  {
    status: "needed",
    title: "Checkout e billing",
    detail: "Checkout/assinatura, status de pagamento, bloqueio de inadimplência e upgrade/downgrade de plano.",
  },
  {
    status: "needed",
    title: "E-mails transacionais",
    detail: "Convite, reset de senha, boas-vindas e alertas operacionais.",
  },
  {
    status: "needed",
    title: "Observabilidade operacional",
    detail: "Logs estruturados, visão de jobs falhos, latência, custo por tenant e alertas básicos.",
  },
  {
    status: "needed",
    title: "Qualidade e aprovação do artifact",
    detail: "Checklist de revisão, feedback humano, versionamento e exportação Markdown/CSV.",
  },
] as const;

export async function getAdminDashboard() {
  const [tenantCount, userCount, jobCount, artifactCount, usage, jobsByStatus, tenants, recentJobs, runtimeTenants, modelConfigs] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.skillJob.count(),
    prisma.artifact.count(),
    prisma.lLMUsageLedger.aggregate({ _sum: { inputTokens: true, outputTokens: true, costUsd: true } }),
    prisma.skillJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        _count: { select: { jobs: true, artifacts: true, memberships: true } },
        usageLedger: { select: { inputTokens: true, outputTokens: true, costUsd: true }, take: 500 },
      },
    }),
    prisma.skillJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { tenant: true, briefing: true, usageLedger: true },
    }),
    prisma.tenant.findMany({ select: { id: true, slug: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lLMProviderConfig.findMany({ orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], include: { tenant: true }, take: 50 }),
  ]);

  return {
    summary: {
      tenantCount,
      userCount,
      jobCount,
      artifactCount,
      inputTokens: usage._sum.inputTokens ?? 0,
      outputTokens: usage._sum.outputTokens ?? 0,
      totalCostUsd: usage._sum.costUsd?.toString() ?? "0",
      jobsByStatus: jobsByStatus.map((item) => ({ status: item.status, count: item._count._all })),
    },
    tenants: tenants.map((tenant) => {
      const usedTokens = tenant.usageLedger.reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0);
      const costUsd = tenant.usageLedger.reduce((sum, item) => sum + Number(item.costUsd), 0);
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        plan: tenant.plan,
        monthlyQuota: tenant.monthlyQuota,
        usedTokens,
        remainingTokens: Math.max(0, tenant.monthlyQuota - usedTokens),
        costUsd: costUsd.toFixed(6),
        jobs: tenant._count.jobs,
        artifacts: tenant._count.artifacts,
        members: tenant._count.memberships,
        createdAt: tenant.createdAt,
      };
    }),
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      tenant: job.tenant.slug,
      title: job.briefing?.title ?? job.skill,
      status: job.status,
      provider: job.usageLedger[0]?.provider ?? null,
      model: job.usageLedger[0]?.model ?? null,
      tokens: job.usageLedger.reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0),
      costUsd: job.usageLedger.reduce((sum, item) => sum + Number(item.costUsd), 0).toFixed(6),
      createdAt: job.createdAt,
    })),
    tenantOptions: runtimeTenants,
    modelConfigs: modelConfigs.map((config) => ({
      id: config.id,
      tenantId: config.tenantId,
      tenant: config.tenant?.slug ?? "global",
      name: config.name,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      inputCostPer1M: config.inputCostPer1M.toString(),
      outputCostPer1M: config.outputCostPer1M.toString(),
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      enabled: config.enabled,
      isDefault: config.isDefault,
      updatedAt: config.updatedAt,
    })),
    readiness: PRODUCTION_READINESS_ITEMS,
  };
}

export async function createAdminTenant(input: unknown) {
  const parsed = createTenantSchema.parse(input);
  return prisma.tenant.create({
    data: {
      ...parsed,
      brandProfile: {
        create: {
          tone: "formal, claro, objetivo e humano",
          audience: "cliente em onboarding",
          promise: "gerar conteúdo útil no tom da marca com revisão humana",
          restrictions: ["sem promessas irreais", "sem jargão de guru"],
          sampleContent: "Conteúdo prático, verificável e orientado a resultado.",
        },
      },
    },
  });
}

export async function updateAdminTenant(input: unknown) {
  const parsed = updateTenantSchema.parse(input);
  const { tenantId, ...data } = parsed;
  return prisma.tenant.update({ where: { id: tenantId }, data });
}

export async function createAdminUser(input: unknown) {
  const parsed = createUserSchema.parse(input);
  const user = await prisma.user.upsert({
    where: { email: parsed.email.toLowerCase() },
    update: { name: parsed.name },
    create: { email: parsed.email.toLowerCase(), name: parsed.name, passwordHash: hashPassword(parsed.password) },
  });

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: parsed.tenantId, userId: user.id } },
    update: { role: parsed.role },
    create: { tenantId: parsed.tenantId, userId: user.id, role: parsed.role },
  });

  return { id: user.id, email: user.email, name: user.name };
}

export async function upsertAdminModelConfig(input: unknown) {
  const parsed = upsertModelConfigSchema.parse(input);
  const { id, ...data } = parsed;
  const tenantId = data.tenantId ?? null;

  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.lLMProviderConfig.updateMany({
        where: { tenantId, isDefault: true, ...(id ? { id: { not: id } } : {}) },
        data: { isDefault: false },
      });
    }

    if (id) {
      return tx.lLMProviderConfig.update({ where: { id }, data: { ...data, tenantId } });
    }

    return tx.lLMProviderConfig.create({ data: { ...data, tenantId } });
  });
}
