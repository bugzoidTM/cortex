import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { deleteTenantLlmCredential, getTenantLlmCredentialStatus, upsertTenantLlmCredential } from "@/lib/tenant-llm-credential";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

// Public response includes apiKeyPreview and trialEndsAt, never the raw API key.
function handleCredentialError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  if (error instanceof RateLimitExceededError) {
    return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
  }
  if (error instanceof ZodError) {
    return Response.json({ ok: false, error: "invalid_input", issues: error.flatten() }, { status: 400 });
  }
  if (error instanceof Error && error.message === "CORTEX_BYOK_ENCRYPTION_SECRET_missing_or_too_short") {
    return Response.json({ ok: false, error: "byok_encryption_not_configured" }, { status: 503 });
  }
  throw error;
}

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const credential = await getTenantLlmCredentialStatus(session.tenantId);
    return Response.json({ ok: true, credential });
  } catch (error) {
    return handleCredentialError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireCurrentSession();
    await checkRateLimit({
      key: `llm_credential:${session.tenantId}:${session.userId}`,
      action: "llm_credential",
      limit: 30,
      windowSeconds: 60 * 60,
    });
    const body = await request.json().catch(() => null);
    const credential = await upsertTenantLlmCredential(session.tenantId, body);
    return Response.json({ ok: true, credential });
  } catch (error) {
    return handleCredentialError(error);
  }
}

export async function DELETE() {
  try {
    const session = await requireCurrentSession();
    const credential = await deleteTenantLlmCredential(session.tenantId);
    return Response.json({ ok: true, credential });
  } catch (error) {
    return handleCredentialError(error);
  }
}
