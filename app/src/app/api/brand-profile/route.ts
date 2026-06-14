import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const brandProfileSchema = z.object({
  tone: z.string().min(3).max(400),
  audience: z.string().min(3).max(600),
  promise: z.string().min(3).max(600),
  restrictions: z.array(z.string().min(2).max(160)).max(20).default([]),
  sampleContent: z.string().max(4000).optional().nullable(),
});

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const profile = await prisma.brandProfile.findUnique({ where: { tenantId: session.tenantId } });

    return Response.json({ ok: true, tenantId: session.tenantId, profile });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    throw error;
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireCurrentSession();
    const body = await request.json().catch(() => null);
    const parsed = brandProfileSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ ok: false, error: "invalid_input", issues: parsed.error.flatten() }, { status: 400 });
    }

    const profile = await prisma.brandProfile.upsert({
      where: { tenantId: session.tenantId },
      update: parsed.data,
      create: {
        tenantId: session.tenantId,
        ...parsed.data,
      },
    });

    return Response.json({ ok: true, tenantId: session.tenantId, profile });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    throw error;
  }
}
