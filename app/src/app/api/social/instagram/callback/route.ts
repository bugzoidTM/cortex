import { getCurrentSession } from "@/lib/auth";
import { verifyState } from "@/lib/crypto";
import { exchangeInstagramCode } from "@/lib/instagram";
import { saveInstagramConnection } from "@/lib/social";

export const dynamic = "force-dynamic";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function redirectToPanel(status: "instagram_conectado" | "instagram_erro" | "instagram_negado") {
  const base = process.env.CORTEX_PUBLIC_URL ?? "https://cortex.nutef.com";
  return Response.redirect(`${base}/painel?social=${status}`, 302);
}

// Callback do OAuth do Instagram: valida o state assinado, confirma a sessão/tenant,
// troca o code por token long-lived e persiste a conexão cifrada.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectToPanel("instagram_negado");
  }
  if (!code || !stateParam) {
    return redirectToPanel("instagram_erro");
  }

  const state = verifyState<{ tenantId: string; userId: string; platform?: string }>(stateParam, STATE_MAX_AGE_MS);
  if (!state || state.platform !== "instagram") {
    return redirectToPanel("instagram_erro");
  }

  const session = await getCurrentSession();
  if (!session || session.tenantId !== state.tenantId) {
    return redirectToPanel("instagram_erro");
  }

  try {
    const token = await exchangeInstagramCode(code);
    await saveInstagramConnection(state.tenantId, state.userId, token);
    return redirectToPanel("instagram_conectado");
  } catch (error) {
    console.error(JSON.stringify({ event: "instagram_callback_error", error: error instanceof Error ? error.message : "unknown" }));
    return redirectToPanel("instagram_erro");
  }
}
