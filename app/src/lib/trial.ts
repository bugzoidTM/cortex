import { prisma } from "./prisma";
import { getActiveTenantLlmCredential } from "./tenant-llm-credential";

// Teste self-service: a conta nasce sem pagamento no plano "trial", vale 14 dias
// e só gera conteúdo com a chave API do próprio cliente (BYOK) — a chave gerenciada
// da Nutef fica reservada aos planos pagos.
export const TRIAL_PLAN = "trial";
export const TRIAL_ACCOUNT_DAYS = 14;
export const TRIAL_MONTHLY_QUOTA = 200_000;

export class TrialBlockedError extends Error {
  constructor(public readonly reason: "trial_expired" | "trial_requires_byok", public readonly trialEndsAt: Date | null) {
    super(reason);
    this.name = "TrialBlockedError";
  }
}

export function trialEndsAtFor(tenantCreatedAt: Date) {
  return new Date(tenantCreatedAt.getTime() + TRIAL_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);
}

// Gate de criação de job para tenants em trial. Tenants pagos/beta passam direto.
export async function assertTrialAllowance(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: true, createdAt: true } });
  if (tenant.plan !== TRIAL_PLAN) {
    return null;
  }

  const trialEndsAt = trialEndsAtFor(tenant.createdAt);
  if (trialEndsAt < new Date()) {
    throw new TrialBlockedError("trial_expired", trialEndsAt);
  }

  const credential = await getActiveTenantLlmCredential(tenantId);
  if (!credential) {
    throw new TrialBlockedError("trial_requires_byok", trialEndsAt);
  }

  return { trialEndsAt };
}
