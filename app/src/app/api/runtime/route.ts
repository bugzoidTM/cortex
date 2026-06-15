import { getEmailRuntimeStatus } from "@/lib/email";
import { getLlmRuntimeStatus } from "@/lib/llm-provider-config";
import { prisma } from "@/lib/prisma";
import { getWooviRuntimeStatus } from "@/lib/woovi";

export const dynamic = "force-dynamic";

export async function GET() {
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
