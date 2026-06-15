import { BillingBlockedError, assertTenantBillingActive } from "@/lib/billing";
import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { createJobInputSchema, enqueueContentPackageJob, getMvpSnapshot, QuotaExceededError } from "@/lib/cortex-mvp";
import { checkRateLimit, jobCreationRateLimitKey, RateLimitExceededError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const snapshot = await getMvpSnapshot(session.tenantId);
    return Response.json({ jobs: snapshot.jobs, metrics: snapshot.metrics, quotaStatus: snapshot.quotaStatus, tenantId: session.tenantId });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCurrentSession();
    await assertTenantBillingActive(session.tenantId);
    await checkRateLimit({ key: jobCreationRateLimitKey(session), action: "create_job", limit: 10, windowSeconds: 60 * 60 });
    const body = await request.json().catch(() => null);
    const parsed = createJobInputSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          ok: false,
          error: "invalid_input",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await enqueueContentPackageJob(parsed.data, session.tenantId);

    return Response.json(
      {
        ok: true,
        queued: true,
        job: result.job,
        briefing: result.briefing,
        artifact: null,
        ledger: null,
        quotaStatus: result.quotaStatus,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    if (error instanceof RateLimitExceededError) {
      return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
    }
    if (error instanceof QuotaExceededError) {
      return Response.json({ ok: false, error: "quota_exceeded", message: error.message, quotaStatus: error.quotaStatus }, { status: 402 });
    }
    if (error instanceof BillingBlockedError) {
      return Response.json({ ok: false, error: "billing_blocked", status: error.status, paymentLinkUrl: error.paymentLinkUrl }, { status: 402 });
    }
    throw error;
  }
}
