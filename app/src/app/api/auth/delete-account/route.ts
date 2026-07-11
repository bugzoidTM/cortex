import { AuthRequiredError, destroyCurrentSession, requireCurrentSession, verifyPassword } from "@/lib/auth";
import { notifyAlert } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, ipRateLimitKey, RateLimitExceededError } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Exclusão de conta (LGPD art. 18): remove o usuário e os tenants dos quais ele é o único
// membro, em cascata (perfil de marca, briefings, jobs, artifacts, ledger, assinaturas,
// invoices). O histórico de pagamento permanece no provedor (Woovi) por obrigação fiscal.

const schema = z.object({ password: z.string().min(8).max(200) });

export async function POST(request: Request) {
  try {
    const session = await requireCurrentSession();

    await checkRateLimit({
      key: ipRateLimitKey("delete_account", getClientIp(request)),
      action: "delete_account",
      limit: 5,
      windowSeconds: 60 * 60,
    });

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      include: { memberships: { include: { tenant: { include: { _count: { select: { memberships: true } } } } } } },
    });

    if (!verifyPassword(parsed.data.password, user.passwordHash)) {
      return Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }

    const soleTenantIds = user.memberships
      .filter((membership) => membership.tenant._count.memberships === 1)
      .map((membership) => membership.tenantId);

    await prisma.$transaction(async (tx) => {
      for (const tenantId of soleTenantIds) {
        await tx.tenant.delete({ where: { id: tenantId } });
      }
      await tx.user.delete({ where: { id: user.id } });
    });

    await destroyCurrentSession();
    await notifyAlert("Conta excluída pelo titular", { email: user.email, tenants: soleTenantIds.length });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    if (error instanceof RateLimitExceededError) {
      return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
    }
    throw error;
  }
}
