import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Health público e enxuto: valida o banco e expõe a saúde da fila (o worker não tem
// endpoint próprio — fila parada/velha aqui é o sinal para o monitor externo alertar).
export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    const now = new Date();
    const [pending, processing, oldestPending, lastCompleted] = await Promise.all([
      prisma.skillJob.count({ where: { status: "PENDING" } }),
      prisma.skillJob.count({ where: { status: "PROCESSING" } }),
      prisma.skillJob.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      prisma.skillJob.findFirst({ where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
    ]);

    return Response.json({
      ok: true,
      app: "cortex",
      database: "ok",
      latencyMs: Date.now() - startedAt,
      queue: {
        pending,
        processing,
        oldestPendingAgeSeconds: oldestPending ? Math.round((now.getTime() - oldestPending.createdAt.getTime()) / 1000) : 0,
        lastCompletedAt: lastCompleted?.completedAt ?? null,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        app: "cortex",
        database: "error",
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503 },
    );
  }
}
