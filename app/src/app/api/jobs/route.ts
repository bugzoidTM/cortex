import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { createContentPackageJob, createJobInputSchema, getMvpSnapshot } from "@/lib/cortex-mvp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const snapshot = await getMvpSnapshot(session.tenantId);
    return Response.json({ jobs: snapshot.jobs, metrics: snapshot.metrics, tenantId: session.tenantId });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCurrentSession();
    const body = await request.json().catch(() => null);
    const parsed = createJobInputSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          ok: false,
          error: "invalid_input",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await createContentPackageJob(parsed.data, session.tenantId);

    return Response.json(
      {
        ok: true,
        job: result.job,
        briefing: result.briefing,
        artifact: result.artifact,
        ledger: result.ledger,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    throw error;
  }
}
