import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createWooviCharge } from "./woovi";
import { sendTransactionalEmail } from "./email";
import { hashPassword } from "./auth";
import { prisma } from "./prisma";

export const SELF_SERVICE_PLANS = {
  starter: { name: "Plano Starter", amountCents: 9700, monthlyQuota: 300_000 },
  pro: { name: "Plano Pro", amountCents: 19700, monthlyQuota: 1_000_000 },
} as const;

const GRACE_DAYS = 5;
const PERIOD_DAYS = 30;
const RENEWAL_LEAD_DAYS = 3;

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

export async function createSelfServiceCheckout(input: unknown) {
  const parsed = checkoutSchema.parse(input);
  const plan = SELF_SERVICE_PLANS[parsed.plan as PlanKey];
  const slug = await uniqueTenantSlug(parsed.company);
  const correlationID = `cortex_${parsed.plan}_${randomBytes(12).toString("hex")}`;

  const charge = await createWooviCharge({
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

    const invoice = await tx.paymentInvoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        wooviCorrelationID: charge.correlationID,
        wooviChargeId: charge.wooviChargeId,
        amountCents: plan.amountCents,
        paymentLinkUrl: charge.paymentLinkUrl,
        brCode: charge.brCode,
        qrCodeImage: charge.qrCodeImage,
        expiresAt: charge.expiresAt,
        rawPayload: charge.raw as object,
      },
    });

    return { tenant, user, subscription, invoice };
  });

  await sendTransactionalEmail({
    to: parsed.email,
    userId: result.user.id,
    subject: "Seu checkout Cortex foi criado",
    text: `Olá ${parsed.name}, seu checkout do Cortex está pronto. Pague pelo Pix: ${charge.paymentLinkUrl ?? "link indisponível"}`,
    html: `<p>Olá ${parsed.name}, seu checkout do Cortex está pronto.</p><p><a href="${charge.paymentLinkUrl ?? "#"}">Pagar com Pix</a></p>`,
  }).catch(() => null);

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
    const periodEnd = new Date(periodBase.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000);

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
    }

    return { invoice: updatedInvoice, subscription, user: invoice.tenant.memberships[0]?.user, alreadyProcessed: false };
  });

  if (!result.alreadyProcessed && result.user) {
    await sendTransactionalEmail({
      to: result.user.email,
      userId: result.user.id,
      subject: "Pagamento confirmado — Cortex liberado",
      text: "Recebemos seu pagamento. Sua assinatura Cortex está ativa e o console já está liberado.",
      html: "<p>Recebemos seu pagamento. Sua assinatura Cortex está ativa e o console já está liberado.</p>",
    }).catch(() => null);
  }

  return result;
}

// Gera a cobrança de renovação (nova invoice PENDING + cobrança Woovi) para o próximo ciclo
// e avisa o titular do vencimento. Idempotente por ciclo: só roda quando não há invoice PENDING.
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

  const charge = await createWooviCharge({
    correlationID,
    value: subscription.amountCents,
    comment: `Cortex ${plan.name} - renovação mensal`,
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

// Rotina periódica do worker: gera cobranças de renovação perto do vencimento e marca
// inadimplência (PAST_DUE) das assinaturas vencidas além da carência.
export async function runBillingRenewalCycle(now = new Date()) {
  const renewalThreshold = new Date(now.getTime() + RENEWAL_LEAD_DAYS * 24 * 60 * 60 * 1000);

  const dueSoon = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      currentPeriodEnd: { lte: renewalThreshold },
      invoices: { none: { status: "PENDING" } },
    },
    select: { id: true },
    take: 100,
  });

  let renewalsCreated = 0;
  for (const sub of dueSoon) {
    try {
      await createRenewalInvoice(sub.id);
      renewalsCreated += 1;
    } catch (error) {
      console.error(JSON.stringify({ event: "renewal_invoice_error", subscriptionId: sub.id, error: error instanceof Error ? error.message : "unknown" }));
    }
  }

  const hardBlockBefore = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  const overdue = await prisma.subscription.updateMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lt: hardBlockBefore } },
    data: { status: "PAST_DUE", pastDueSince: now },
  });

  return { renewalsCreated, markedPastDue: overdue.count };
}

export async function assertTenantBillingActive(tenantId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ["ACTIVE", "PAST_DUE", "PENDING", "INCOMPLETE"] } },
    orderBy: { createdAt: "desc" },
    include: { invoices: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!subscription) {
    return null;
  }

  const now = new Date();
  if (subscription.status === "PENDING" || subscription.status === "INCOMPLETE") {
    throw new BillingBlockedError(subscription.status, subscription.invoices[0]?.paymentLinkUrl);
  }

  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
    const pastDueSince = subscription.pastDueSince ?? subscription.currentPeriodEnd;
    const hardBlockAt = new Date(pastDueSince.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    const status = hardBlockAt < now ? "PAST_DUE" : subscription.status;
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "PAST_DUE", pastDueSince } });
    if (status === "PAST_DUE") {
      throw new BillingBlockedError("PAST_DUE", subscription.invoices[0]?.paymentLinkUrl);
    }
  }

  return subscription;
}

async function uniqueTenantSlug(company: string) {
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
