import { getLlmRuntimeStatus } from "@/lib/runtime-config";
import { prisma } from "@/lib/prisma";

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
      llm: getLlmRuntimeStatus(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        database: {
          status: "error",
          latencyMs: Date.now() - startedAt,
        },
        llm: getLlmRuntimeStatus(),
        error: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
