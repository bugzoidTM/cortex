import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { getMvpSnapshot } from "@/lib/cortex-mvp";

export const dynamic = "force-dynamic";

// Snapshot do tenant do usuário autenticado. Sem sessão não há dados:
// este endpoint já expôs o tenant demo publicamente e isso não volta.
export async function GET() {
  try {
    const session = await requireCurrentSession();
    const snapshot = await getMvpSnapshot(session.tenantId);
    return Response.json(snapshot);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    throw error;
  }
}
