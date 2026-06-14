import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return Response.json({
      ok: true,
      app: "cortex",
      database: "ok",
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        app: "cortex",
        database: "error",
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503 },
    );
  }
}
