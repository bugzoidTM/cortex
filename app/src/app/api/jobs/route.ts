import { createContentPackageJob, createJobInputSchema, getMvpSnapshot } from "@/lib/cortex-mvp";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getMvpSnapshot();
  return Response.json({ jobs: snapshot.jobs, metrics: snapshot.metrics });
}

export async function POST(request: Request) {
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

  const result = await createContentPackageJob(parsed.data);

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
}
