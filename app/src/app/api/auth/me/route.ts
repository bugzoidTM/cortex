import { getCurrentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return Response.json({ ok: false, authenticated: false }, { status: 401 });
  }

  return Response.json({
    ok: true,
    authenticated: true,
    user: { id: session.userId, email: session.email, name: session.name },
    tenantId: session.tenantId,
    role: session.role,
  });
}
