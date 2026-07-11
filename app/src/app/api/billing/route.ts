import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import {
  ensureUsablePaymentLink,
  getTenantBillingSummary,
  setSubscriptionCancelAtPeriodEnd,
} from "@/lib/billing";
import { checkRateLimit, getClientIp, ipRateLimitKey, RateLimitExceededError } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { TRIAL_PLAN, trialEndsAtFor } from "@/lib/trial";
import { z } from "zod";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["cancel", "resume", "regenerate_invoice"]),
});

function handleBillingError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  if (error instanceof RateLimitExceededError) {
    return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
  }
  throw error;
}

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const [subscription, tenant] = await Promise.all([
      getTenantBillingSummary(session.tenantId),
      prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { plan: true, createdAt: true } }),
    ]);
    const trial = tenant.plan === TRIAL_PLAN ? { trialEndsAt: trialEndsAtFor(tenant.createdAt) } : null;
    return Response.json({ ok: true, plan: tenant.plan, subscription, trial });
  } catch (error) {
    return handleBillingError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCurrentSession();
    await checkRateLimit({
      key: ipRateLimitKey("billing_action", getClientIp(request)),
      action: "billing_action",
      limit: 10,
      windowSeconds: 60 * 60,
    });

    const body = await request.json().catch(() => null);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    if (parsed.data.action === "cancel" || parsed.data.action === "resume") {
      const subscription = await setSubscriptionCancelAtPeriodEnd(session.tenantId, parsed.data.action === "cancel");
      if (!subscription) {
        return Response.json({ ok: false, error: "no_active_subscription" }, { status: 404 });
      }
      return Response.json({ ok: true, subscription: await getTenantBillingSummary(session.tenantId) });
    }

    // regenerate_invoice: dá ao cliente bloqueado um Pix pagável quando o anterior expirou.
    const latest = await prisma.subscription.findFirst({
      where: { tenantId: session.tenantId, status: { in: ["PENDING", "INCOMPLETE", "PAST_DUE", "ACTIVE"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) {
      return Response.json({ ok: false, error: "no_subscription" }, { status: 404 });
    }
    const paymentLinkUrl = await ensureUsablePaymentLink(latest.id);
    return Response.json({ ok: true, paymentLinkUrl, subscription: await getTenantBillingSummary(session.tenantId) });
  } catch (error) {
    return handleBillingError(error);
  }
}
