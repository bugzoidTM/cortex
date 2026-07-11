import { AuthRequiredError, requireSuperuserSession, SuperuserRequiredError } from "@/lib/auth";
import { getEmailRuntimeStatus } from "@/lib/email";
import { getLlmRuntimeStatus } from "@/lib/llm-provider-config";
import { prisma } from "@/lib/prisma";
import { getWooviRuntimeStatus } from "@/lib/woovi";

export const dynamic = "force-dynamic";

// Diagnóstico operacional (provider LLM, Woovi, SMTP): só superusuário.
// Uptime externo deve usar /api/health, que é público e não expõe configuração.
export async function GET() {
  try {
    await requireSuperuserSession();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    if (error instanceof SuperuserRequiredError) {
      return Response.json({ ok: false, error: "superuser_required" }, { status: 403 });
    }
    throw error;
  }

  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return Response.json({
      ok: true,
      database: {
        status: "ok",
        latencyMs: Date.now() - startedAt,
      },
      llm: await getLlmRuntimeStatus(),
      woovi: getWooviRuntimeStatus(),
      email: getEmailRuntimeStatus(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        database: {
          status: "error",
          latencyMs: Date.now() - startedAt,
        },
        llm: await getLlmRuntimeStatus(),
        woovi: getWooviRuntimeStatus(),
        email: getEmailRuntimeStatus(),
        error: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
