import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createWooviCharge } from "./woovi";
import { sendTransactionalEmail } from "./email";
import { hashPassword, isSuperuserEmail, verifyPassword } from "./auth";
import { notifyAlert } from "./alerts";
import { prisma } from "./prisma";

export const SELF_SERVICE_PLANS = {
  starter: { name: "Plano Starter", amountCents: 9700, monthlyQuota: 300_000 },
  pro: { name: "Plano Pro", amountCents: 19700, monthlyQuota: 1_000_000 },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 5;
const PERIOD_DAYS = 30;
const RENEWAL_LEAD_DAYS = 3;
// Inadimplente recebe nova cobrança Pix (a anterior expira em ~7 dias) por até 30 dias antes de desistirmos.
const PAST_DUE_RETRY_DAYS = 30;
// Checkout nunca pago vira lixo depois disso e libera o e-mail/slug para nova tentativa.
const ABANDONED_CHECKOUT_DAYS = 7;

type PlanKey = keyof typeof SELF_SERVICE_PLANS;

export const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro"]),
  name: z.string().min(2).max(120),
  company: z.string().min(2).max(120),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(160),
  phone: z.string().min(8).max(30).optional(),
  taxID: z.string().min(11).max(18).optional(),
});

export class BillingBlockedError extends Error {
  constructor(public readonly status: string, public readonly paymentLinkUrl?: string | null) {
    super("billing_blocked");
  }
}

export class CheckoutConflictError extends Error {
  constructor(public readonly reason: "email_in_use" | "already_subscribed") {
    super("checkout_conflict");
  }
}

export async function createSelfServiceCheckout(input: unknown) {
  const parsed = checkoutSchema.parse(input);

  // E-mails de superuser nunca nascem por autoatendimento (a conta admin é provisionada manualmente).
  if (isSuperuserEmail(parsed.email)) {
    throw new CheckoutConflictError("email_in_use");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.email },
    include: { memberships: { include: { tenant: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });

  if (existingUser) {
    return createCheckoutForExistingAccount(existingUser.id, parsed);
  }

  const plan = SELF_SERVICE_PLANS[parsed.plan as PlanKey];
  const slug = await uniqueTenantSlug(parsed.company);
  const charge = await createFirstCycleCharge(parsed, plan);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        slug,
        name: parsed.company,
        plan: parsed.plan,
        monthlyQuota: plan.monthlyQuota,
        brandProfile: {
          create: {
            tone: "formal, claro, objetivo e humano",
            audience: "cliente em onboarding self-service",
            promise: "gerar conteúdo útil no tom da marca com revisão humana",
            restrictions: ["sem promessas irreais", "sem jargão de guru"],
            sampleContent: "Conteúdo prático, verificável e orientado a resultado.",
          },
        },
      },
    });

    const user = await tx.user.create({
      data: { email: parsed.email, name: parsed.name, passwordHash: hashPassword(parsed.password) },
    });

    await tx.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role: "owner" } });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: parsed.plan,
        status: "PENDING",
        amountCents: plan.amountCents,
        monthlyQuota: plan.monthlyQuota,
      },
    });

    const invoice = await createInvoiceRecord(tx, tenant.id, subscription.id, plan.amountCents, charge);

    return { tenant, user, subscription, invoice };
  });

  await sendCheckoutCreatedEmail(parsed.email, result.user.id, parsed.name, charge.paymentLinkUrl);

  return {
    tenantId: result.tenant.id,
    subscriptionId: result.subscription.id,
    invoiceId: result.invoice.id,
    correlationID: charge.correlationID,
    paymentLinkUrl: charge.paymentLinkUrl,
    brCode: charge.brCode,
    qrCodeImage: charge.qrCodeImage,
    expiresAt: charge.expiresAt,
  };
}

// Checkout com e-mail já cadastrado: exige a senha da conta e reaproveita o tenant existente.
// Cobre dois casos legítimos — retomar um checkout abandonado e fazer upgrade de trial para plano pago.
async function createCheckoutForExistingAccount(userId: string, parsed: z.infer<typeof checkoutSchema>) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { memberships: { include: { tenant: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });

  const membership = user.memberships[0];
  if (!membership || !verifyPassword(parsed.password, user.passwordHash)) {
    throw new CheckoutConflictError("email_in_use");
  }

  const tenant = membership.tenant;
  const hasPaidAccess = await prisma.subscription.findFirst({
    where: { tenantId: tenant.id, status: { in: ["ACTIVE", "PAST_DUE"] } },
  });
  if (hasPaidAccess) {
    throw new CheckoutConflictError("already_subscribed");
  }

  const plan = SELF_SERVICE_PLANS[parsed.plan as PlanKey];
  const charge = await createFirstCycleCharge(parsed, plan);

  const result = await prisma.$transaction(async (tx) => {
    // Assinaturas PENDING antigas (checkout abandonado) são supersedidas para não duplicar cobrança viva.
    await tx.subscription.updateMany({
      where: { tenantId: tenant.id, status: { in: ["PENDING", "INCOMPLETE"] } },
      data: { status: "CANCELED" },
    });
    await tx.paymentInvoice.updateMany({
      where: { tenantId: tenant.id, status: "PENDING" },
      data: { status: "CANCELED" },
    });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: parsed.plan,
        status: "PENDING",
        amountCents: plan.amountCents,
        monthlyQuota: plan.monthlyQuota,
      },
    });

    const invoice = await createInvoiceRecord(tx, tenant.id, subscription.id, plan.amountCents, charge);

    return { subscription, invoice };
  });

  await sendCheckoutCreatedEmail(parsed.email, user.id, parsed.name, charge.paymentLinkUrl);

  return {
    tenantId: tenant.id,
    subscriptionId: result.subscription.id,
    invoiceId: result.invoice.id,
    correlationID: charge.correlationID,
    paymentLinkUrl: charge.paymentLinkUrl,
    brCode: charge.brCode,
    qrCodeImage: charge.qrCodeImage,
    expiresAt: charge.expiresAt,
  };
}

async function createFirstCycleCharge(parsed: z.infer<typeof checkoutSchema>, plan: (typeof SELF_SERVICE_PLANS)[PlanKey]) {
  const correlationID = `cortex_${parsed.plan}_${randomBytes(12).toString("hex")}`;
  return createWooviCharge({
    correlationID,
    value: plan.amountCents,
    comment: `Cortex ${plan.name} - primeiro ciclo mensal`,
    customer: {
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      taxID: parsed.taxID,
    },
    expiresIn: 3 * 24 * 60 * 60,
  });
}

type WooviChargeResult = Awaited<ReturnType<typeof createWooviCharge>>;
type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function createInvoiceRecord(tx: PrismaTx, tenantId: string, subscriptionId: string, amountCents: number, charge: WooviChargeResult) {
  return tx.paymentInvoice.create({
    data: {
      tenantId,
      subscriptionId,
      wooviCorrelationID: charge.correlationID,
      wooviChargeId: charge.wooviChargeId,
      amountCents,
      paymentLinkUrl: charge.paymentLinkUrl,
      brCode: charge.brCode,
      qrCodeImage: charge.qrCodeImage,
      expiresAt: charge.expiresAt,
      rawPayload: charge.raw as object,
    },
  });
}

async function sendCheckoutCreatedEmail(to: string, userId: string, name: string, paymentLinkUrl?: string | null) {
  await sendTransactionalEmail({
    to,
    userId,
    subject: "Seu checkout Cortex foi criado",
    text: `Olá ${name}, seu checkout do Cortex está pronto. Pague pelo Pix: ${paymentLinkUrl ?? "link indisponível"}`,
    html: `<p>Olá ${name}, seu checkout do Cortex está pronto.</p><p><a href="${paymentLinkUrl ?? "#"}">Pagar com Pix</a></p>`,
  }).catch(() => null);
}

type WooviWebhookPayload = {
  event?: string;
  correlationID?: string;
  charge?: { correlationID?: string; paidAt?: string };
  pix?: { charge?: { correlationID?: string; paidAt?: string } };
};

export async function handleWooviChargeCompleted(payload: WooviWebhookPayload) {
  const correlationID = payload.charge?.correlationID ?? payload.pix?.charge?.correlationID ?? payload.correlationID;
  if (!correlationID) {
    throw new Error("woovi_correlation_id_missing");
  }

  const paidAt = payload.charge?.paidAt ? new Date(payload.charge.paidAt) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.paymentInvoice.findUniqueOrThrow({
      where: { wooviCorrelationID: correlationID },
      include: { subscription: true, tenant: { include: { memberships: { include: { user: true }, take: 1 } } } },
    });

    // Idempotência: reenvio do mesmo evento não recalcula período nem reenvia e-mail.
    if (invoice.status === "PAID") {
      return { invoice, subscription: invoice.subscription, user: invoice.tenant.memberships[0]?.user, alreadyProcessed: true };
    }

    const updatedInvoice = await tx.paymentInvoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAt, rawPayload: payload },
    });

    // Renovação paga antes do vencimento estende a partir do fim do período atual (sem perder dias).
    const periodBase =
      invoice.subscription?.currentPeriodEnd && invoice.subscription.currentPeriodEnd > paidAt
        ? invoice.subscription.currentPeriodEnd
        : paidAt;
    const periodEnd = new Date(periodBase.getTime() + PERIOD_DAYS * DAY_MS);

    const subscription = invoice.subscription
      ? await tx.subscription.update({
          where: { id: invoice.subscription.id },
          data: {
            status: "ACTIVE",
            currentPeriodStart: paidAt,
            currentPeriodEnd: periodEnd,
            pastDueSince: null,
          },
        })
      : null;

    if (subscription) {
      await tx.tenant.update({
        where: { id: invoice.tenantId },
        data: { plan: subscription.plan, monthlyQuota: subscription.monthlyQuota },
      });
      // Plano pago usa o LLM gerenciado pela Nutef: a chave BYOK do trial sai de cena.
      await tx.tenantLlmCredential.updateMany({
        where: { tenantId: invoice.tenantId },
        data: { enabled: false },
      });
    }

    return { invoice: updatedInvoice, subscription, user: invoice.tenant.memberships[0]?.user, alreadyProcessed: false };
  });

  if (!result.alreadyProcessed && result.user) {
    await sendTransactionalEmail({
      to: result.user.email,
      userId: result.user.id,
      subject: "Pagamento confirmado — Cortex liberado",
      text: "Recebemos seu pagamento. Sua assinatura Cortex está ativa e o console já está liberado em https://cortex.nutef.com/#acesso.",
      html: '<p>Recebemos seu pagamento. Sua assinatura Cortex está ativa.</p><p><a href="https://cortex.nutef.com/#acesso">Entrar no console</a></p>',
    }).catch(() => null);
  }

  return result;
}

// Gera a cobrança do próximo ciclo (nova invoice PENDING + cobrança Woovi) e avisa o titular.
// Idempotente por ciclo: os chamadores garantem que não há invoice PENDING viva antes de chamar.
export async function createRenewalInvoice(subscriptionId: string) {
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { tenant: { include: { memberships: { include: { user: true }, take: 1 } } } },
  });

  const owner = subscription.tenant.memberships[0]?.user;
  if (!owner) {
    throw new Error("renewal_owner_missing");
  }

  const plan = SELF_SERVICE_PLANS[subscription.plan as PlanKey] ?? {
    name: `Plano ${subscription.plan}`,
    amountCents: subscription.amountCents,
    monthlyQuota: subscription.monthlyQuota,
  };
  const correlationID = `cortex_${subscription.plan}_renew_${randomBytes(12).toString("hex")}`;
  const dueDate = subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toLocaleDateString("pt-BR") : "em breve";
  // Assinatura que nunca ativou (checkout pendente) recebe cobrança de primeiro ciclo, não de renovação.
  const isFirstCycle = !subscription.currentPeriodStart;

  const charge = await createWooviCharge({
    correlationID,
    value: subscription.amountCents,
    comment: `Cortex ${plan.name} - ${isFirstCycle ? "primeiro ciclo mensal" : "renovação mensal"}`,
    customer: { name: owner.name ?? subscription.tenant.name, email: owner.email },
    expiresIn: (RENEWAL_LEAD_DAYS + 4) * 24 * 60 * 60,
  });

  const invoice = await prisma.paymentInvoice.create({
    data: {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      wooviCorrelationID: charge.correlationID,
      wooviChargeId: charge.wooviChargeId,
      amountCents: subscription.amountCents,
      paymentLinkUrl: charge.paymentLinkUrl,
      brCode: charge.brCode,
      qrCodeImage: charge.qrCodeImage,
      expiresAt: charge.expiresAt,
      rawPayload: charge.raw as object,
    },
  });

  await sendTransactionalEmail({
    to: owner.email,
    userId: owner.id,
    subject: "Sua assinatura Cortex vence em breve — renove via Pix",
    text: `Olá ${owner.name ?? ""}, sua assinatura ${plan.name} vence em ${dueDate}. Renove via Pix para manter o acesso: ${charge.paymentLinkUrl ?? "link indisponível"}`,
    html: `<p>Olá ${owner.name ?? ""}, sua assinatura <b>${plan.name}</b> vence em ${dueDate}.</p><p><a href="${charge.paymentLinkUrl ?? "#"}">Renovar com Pix</a></p>`,
  }).catch(() => null);

  return invoice;
}

// Agenda (ou desfaz) o cancelamento no fim do período vigente. Não corta acesso já pago.
export async function setSubscriptionCancelAtPeriodEnd(tenantId: string, cancel: boolean) {
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ["ACTIVE", "PAST_DUE"] } },
    orderBy: { createdAt: "desc" },
    include: { tenant: { include: { memberships: { include: { user: true }, take: 1 } } } },
  });

  if (!subscription) {
    return null;
  }

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { cancelAtPeriodEnd: cancel },
  });

  const owner = subscription.tenant.memberships[0]?.user;
  if (owner) {
    const endDate = subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toLocaleDateString("pt-BR") : "o fim do período vigente";
    await sendTransactionalEmail({
      to: owner.email,
      userId: owner.id,
      subject: cancel ? "Cancelamento da assinatura Cortex agendado" : "Cancelamento da assinatura Cortex revertido",
      text: cancel
        ? `Seu cancelamento foi registrado. O acesso continua até ${endDate} e nenhuma nova cobrança será gerada. Se mudar de ideia, reative pelo console.`
        : "O cancelamento agendado foi revertido. Sua assinatura Cortex segue ativa e será renovada normalmente.",
    }).catch(() => null);
  }

  return updated;
}

// Estado de assinatura resumido para o console do cliente.
export async function getTenantBillingSummary(tenantId: string) {
  const now = new Date();
  const pendingInvoiceInclude = {
    invoices: {
      where: { status: "PENDING" as const, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" as const },
      take: 1,
    },
  };
  // Mesma regra do gate: ACTIVE tem precedência sobre um checkout PENDING mais novo.
  const subscription =
    (await prisma.subscription.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: pendingInvoiceInclude,
    })) ??
    (await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: pendingInvoiceInclude,
    }));

  if (!subscription) {
    return null;
  }

  return {
    plan: subscription.plan,
    status: subscription.status,
    amountCents: subscription.amountCents,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    pendingInvoice: subscription.invoices[0]
      ? { paymentLinkUrl: subscription.invoices[0].paymentLinkUrl, expiresAt: subscription.invoices[0].expiresAt }
      : null,
  };
}

// Garante um link de pagamento pagável para uma assinatura bloqueada/pendente:
// expira invoices Pix mortas e gera cobrança nova quando não sobra nenhuma viva.
export async function ensureUsablePaymentLink(subscriptionId: string): Promise<string | null> {
  const now = new Date();
  await prisma.paymentInvoice.updateMany({
    where: { subscriptionId, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const alive = await prisma.paymentInvoice.findFirst({
    where: { subscriptionId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (alive?.paymentLinkUrl) {
    return alive.paymentLinkUrl;
  }

  try {
    const invoice = await createRenewalInvoice(subscriptionId);
    return invoice.paymentLinkUrl;
  } catch (error) {
    console.error(JSON.stringify({ event: "ensure_payment_link_error", subscriptionId, error: error instanceof Error ? error.message : "unknown" }));
    return null;
  }
}

// Rotina periódica do worker: expira invoices Pix vencidas, finaliza cancelamentos agendados,
// gera cobranças de renovação perto do vencimento, re-cobra inadimplentes recentes,
// marca inadimplência além da carência e limpa checkouts abandonados.
export async function runBillingRenewalCycle(now = new Date()) {
  // Invoice Pix morta não pode continuar PENDING: é ela que trava a geração de nova cobrança.
  const expiredInvoices = await prisma.paymentInvoice.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  // Cancelamento agendado vence junto com o período: sem nova cobrança, acesso encerra.
  const canceled = await prisma.subscription.updateMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] }, cancelAtPeriodEnd: true, currentPeriodEnd: { lt: now } },
    data: { status: "CANCELED" },
  });

  const renewalThreshold = new Date(now.getTime() + RENEWAL_LEAD_DAYS * DAY_MS);
  const dueSoon = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { lte: renewalThreshold },
      invoices: { none: { status: "PENDING" } },
    },
    select: { id: true },
    take: 100,
  });

  // Inadimplente recente ainda merece um caminho de volta: nova cobrança quando a anterior expirou.
  const pastDueRetryAfter = new Date(now.getTime() - PAST_DUE_RETRY_DAYS * DAY_MS);
  const pastDueRetry = await prisma.subscription.findMany({
    where: {
      status: "PAST_DUE",
      cancelAtPeriodEnd: false,
      pastDueSince: { gte: pastDueRetryAfter },
      invoices: { none: { status: "PENDING" } },
    },
    select: { id: true },
    take: 100,
  });

  let renewalsCreated = 0;
  for (const sub of [...dueSoon, ...pastDueRetry]) {
    try {
      await createRenewalInvoice(sub.id);
      renewalsCreated += 1;
    } catch (error) {
      console.error(JSON.stringify({ event: "renewal_invoice_error", subscriptionId: sub.id, error: error instanceof Error ? error.message : "unknown" }));
    }
  }

  // Vencidas além da carência viram PAST_DUE (o acesso é cortado no ponto de gasto).
  const hardBlockBefore = new Date(now.getTime() - GRACE_DAYS * DAY_MS);
  await prisma.subscription.updateMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lt: hardBlockBefore }, pastDueSince: null },
    data: { pastDueSince: now },
  });
  const overdue = await prisma.subscription.updateMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lt: hardBlockBefore } },
    data: { status: "PAST_DUE" },
  });

  const abandonedCleaned = await cleanupAbandonedCheckouts(now);

  return {
    renewalsCreated,
    markedPastDue: overdue.count,
    expiredInvoices: expiredInvoices.count,
    canceledSubscriptions: canceled.count,
    abandonedCheckoutsCleaned: abandonedCleaned,
  };
}

// Remove contas de checkout self-service que nunca pagaram: libera o e-mail e o slug
// para uma nova tentativa de compra. Só toca tenants sem nenhum uso e sem pagamento.
async function cleanupAbandonedCheckouts(now: Date) {
  const cutoff = new Date(now.getTime() - ABANDONED_CHECKOUT_DAYS * DAY_MS);
  const abandoned = await prisma.tenant.findMany({
    where: {
      plan: { in: Object.keys(SELF_SERVICE_PLANS) },
      createdAt: { lt: cutoff },
      // `some` protege tenant provisionado manualmente (sem assinatura) de ser varrido;
      // `every` garante que nenhuma assinatura chegou a ativar.
      subscriptions: {
        some: {},
        every: { status: { in: ["PENDING", "INCOMPLETE", "CANCELED"] }, currentPeriodStart: null },
      },
      paymentInvoices: { none: { status: "PAID" } },
      jobs: { none: {} },
      artifacts: { none: {} },
    },
    include: { memberships: { select: { userId: true } } },
    take: 50,
  });

  let cleaned = 0;
  for (const tenant of abandoned) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const membership of tenant.memberships) {
          const otherMemberships = await tx.tenantMembership.count({
            where: { userId: membership.userId, tenantId: { not: tenant.id } },
          });
          if (otherMemberships === 0) {
            await tx.user.delete({ where: { id: membership.userId } });
          }
        }
        await tx.tenant.delete({ where: { id: tenant.id } });
      });
      cleaned += 1;
    } catch (error) {
      console.error(JSON.stringify({ event: "abandoned_checkout_cleanup_error", tenantId: tenant.id, error: error instanceof Error ? error.message : "unknown" }));
    }
  }

  if (cleaned > 0) {
    await notifyAlert(`Limpeza de checkouts abandonados: ${cleaned} tenant(s) removido(s)`, { cleaned });
  }

  return cleaned;
}

export async function assertTenantBillingActive(tenantId: string) {
  // Uma assinatura ACTIVE sempre vence: um checkout PENDING mais novo (upgrade/troca de plano
  // ainda não pago) não pode bloquear quem já tem acesso pago vigente.
  const subscription =
    (await prisma.subscription.findFirst({ where: { tenantId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })) ??
    (await prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } }));

  // Tenant sem assinatura (beta/trial provisionado fora do checkout) não passa pelo billing.
  if (!subscription) {
    return null;
  }

  const now = new Date();

  if (subscription.status === "CANCELED") {
    throw new BillingBlockedError("CANCELED", null);
  }

  if (subscription.status === "PENDING" || subscription.status === "INCOMPLETE" || subscription.status === "PAST_DUE") {
    throw new BillingBlockedError(subscription.status, await ensureUsablePaymentLink(subscription.id));
  }

  // ACTIVE vencida: dentro da carência mantém acesso; além dela vira PAST_DUE e bloqueia.
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
    const pastDueSince = subscription.pastDueSince ?? subscription.currentPeriodEnd;
    const hardBlockAt = new Date(pastDueSince.getTime() + GRACE_DAYS * DAY_MS);

    if (hardBlockAt < now) {
      await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "PAST_DUE", pastDueSince } });
      throw new BillingBlockedError("PAST_DUE", await ensureUsablePaymentLink(subscription.id));
    }

    if (!subscription.pastDueSince) {
      await prisma.subscription.update({ where: { id: subscription.id }, data: { pastDueSince } });
    }
  }

  return subscription;
}

export async function uniqueTenantSlug(company: string) {
  const base = company
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "cliente";

  for (let i = 0; i < 20; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const exists = await prisma.tenant.findUnique({ where: { slug } });
    if (!exists) return slug;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}
