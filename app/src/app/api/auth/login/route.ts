import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { z } from "zod";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: { take: 1 } },
  });

  if (!user || !user.memberships[0] || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const session = await createSession(user.id);
  const cookie = setSessionCookie(session.token, session.expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, cookie.options);

  return Response.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
    tenantId: user.memberships[0].tenantId,
  });
}
