import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { signState } from "@/lib/crypto";
import { buildAuthorizationUrl, isLinkedInConfigured } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

// Inicia o OAuth: gera um `state` assinado (CSRF + validade curta) e redireciona
// o usuário autenticado para a tela de autorização do LinkedIn.
export async function GET() {
  try {
    const session = await requireCurrentSession();
    if (!isLinkedInConfigured()) {
      return Response.json({ ok: false, error: "linkedin_not_configured" }, { status: 503 });
    }
    const state = signState({ tenantId: session.tenantId, userId: session.userId, ts: Date.now() });
    return Response.redirect(buildAuthorizationUrl(state), 302);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    throw error;
  }
}
