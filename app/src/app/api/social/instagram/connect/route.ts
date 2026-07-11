import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { signState } from "@/lib/crypto";
import { buildInstagramAuthUrl, isInstagramConfigured } from "@/lib/instagram";

export const dynamic = "force-dynamic";

// Inicia o OAuth do Instagram (Instagram Login): state assinado + redirect para a
// tela de autorização do Instagram.
export async function GET() {
  try {
    const session = await requireCurrentSession();
    if (!isInstagramConfigured()) {
      return Response.json({ ok: false, error: "instagram_not_configured" }, { status: 503 });
    }
    const state = signState({ tenantId: session.tenantId, userId: session.userId, platform: "instagram", ts: Date.now() });
    return Response.redirect(buildInstagramAuthUrl(state), 302);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    throw error;
  }
}
