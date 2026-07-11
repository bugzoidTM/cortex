import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { disconnectSocial, getSocialConnectionStatus } from "@/lib/social";
import { isLinkedInConfigured } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

function handle(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  throw error;
}

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const connection = await getSocialConnectionStatus(session.tenantId);
    return Response.json({ ok: true, configured: isLinkedInConfigured(), connection });
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE() {
  try {
    const session = await requireCurrentSession();
    const connection = await disconnectSocial(session.tenantId);
    return Response.json({ ok: true, connection });
  } catch (error) {
    return handle(error);
  }
}
