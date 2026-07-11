import { CheckoutConflictError, createSelfServiceCheckout } from "@/lib/billing";
import { checkRateLimit, getClientIp, ipRateLimitKey, RateLimitExceededError } from "@/lib/rate-limit";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

const CHECKOUT_WINDOW_SECONDS = 60 * 60;
const CHECKOUT_MAX_PER_IP = 8;

export async function POST(request: Request) {
  try {
    await checkRateLimit({
      key: ipRateLimitKey("checkout", getClientIp(request)),
      action: "checkout",
      limit: CHECKOUT_MAX_PER_IP,
      windowSeconds: CHECKOUT_WINDOW_SECONDS,
    });

    const body = await request.json().catch(() => null);
    const checkout = await createSelfServiceCheckout(body);
    return Response.json(
      {
        ok: true,
        checkout,
        paymentLinkUrl: checkout.paymentLinkUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
    }
    if (error instanceof ZodError) {
      return Response.json({ ok: false, error: "invalid_input", issues: error.flatten() }, { status: 400 });
    }
    if (error instanceof CheckoutConflictError) {
      const errorCode = error.reason === "already_subscribed" ? "tenant_already_subscribed" : "email_or_company_already_exists";
      return Response.json({ ok: false, error: errorCode }, { status: 409 });
    }
    if (error instanceof Error && error.message === "woovi_app_id_missing") {
      return Response.json({ ok: false, error: "woovi_not_configured" }, { status: 503 });
    }
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return Response.json({ ok: false, error: "email_or_company_already_exists" }, { status: 409 });
    }
    throw error;
  }
}
