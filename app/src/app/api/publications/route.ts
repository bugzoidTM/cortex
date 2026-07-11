import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { enqueuePublication, listPublications, PublicationBlockedError } from "@/lib/social";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

function handle(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  if (error instanceof RateLimitExceededError) {
    return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
  }
  if (error instanceof ZodError) {
    return Response.json({ ok: false, error: "invalid_input", issues: error.flatten() }, { status: 400 });
  }
  if (error instanceof PublicationBlockedError) {
    return Response.json({ ok: false, error: error.reason }, { status: 409 });
  }
  throw error;
}

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const publications = await listPublications(session.tenantId);
    return Response.json({ ok: true, publications });
  } catch (error) {
    return handle(error);
  }
}

// Publicar exige a ação explícita do usuário: ele envia o texto final que revisou/aprovou.
export async function POST(request: Request) {
  try {
    const session = await requireCurrentSession();
    await checkRateLimit({
      key: `publication:${session.tenantId}:${session.userId}`,
      action: "publication",
      limit: 30,
      windowSeconds: 24 * 60 * 60,
    });
    const body = await request.json().catch(() => null);
    const publication = await enqueuePublication(session.tenantId, body);
    return Response.json({ ok: true, publication: { id: publication.id, status: publication.status } }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}
