import { getCurrentSession } from "@/lib/auth";
import { verifyState } from "@/lib/crypto";
import { exchangeCodeForToken } from "@/lib/linkedin";
import { saveLinkedInConnection } from "@/lib/social";

export const dynamic = "force-dynamic";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function redirectToConsole(status: "linkedin_conectado" | "linkedin_erro" | "linkedin_negado") {
  const base = process.env.CORTEX_PUBLIC_URL ?? "https://cortex.nutef.com";
  return Response.redirect(`${base}/?social=${status}#acesso`, 302);
}

// Callback do OAuth: valida o state assinado, confirma a sessão e o tenant, troca o
// code por token e persiste a conexão cifrada. Sempre redireciona de volta ao console.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectToConsole("linkedin_negado");
  }
  if (!code || !stateParam) {
    return redirectToConsole("linkedin_erro");
  }

  const state = verifyState<{ tenantId: string; userId: string }>(stateParam, STATE_MAX_AGE_MS);
  if (!state) {
    return redirectToConsole("linkedin_erro");
  }

  // Defesa em profundidade: a sessão do navegador precisa ser do mesmo tenant do state.
  const session = await getCurrentSession();
  if (!session || session.tenantId !== state.tenantId) {
    return redirectToConsole("linkedin_erro");
  }

  try {
    const token = await exchangeCodeForToken(code);
    await saveLinkedInConnection(state.tenantId, state.userId, token);
    return redirectToConsole("linkedin_conectado");
  } catch (error) {
    console.error(JSON.stringify({ event: "linkedin_callback_error", error: error instanceof Error ? error.message : "unknown" }));
    return redirectToConsole("linkedin_erro");
  }
}
