import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertWithinRateLimit,
  loginEmailRateLimitKey,
  loginIpRateLimitKey,
  recordRateLimitEvent,
  RateLimitExceededError,
} from "@/lib/rate-limit";
import { cookies } from "next/headers";
import { z } from "zod";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_PER_IP = 30;
const LOGIN_MAX_PER_EMAIL = 10;

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const ipKey = loginIpRateLimitKey(getClientIp(request));
  const emailKey = loginEmailRateLimitKey(parsed.data.email);

  try {
    await assertWithinRateLimit({ key: ipKey, action: "login", limit: LOGIN_MAX_PER_IP, windowSeconds: LOGIN_WINDOW_SECONDS });
    await assertWithinRateLimit({ key: emailKey, action: "login", limit: LOGIN_MAX_PER_EMAIL, windowSeconds: LOGIN_WINDOW_SECONDS });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
    }
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: { take: 1 } },
  });

  if (!user || !user.memberships[0] || !verifyPassword(parsed.data.password, user.passwordHash)) {
    // Só tentativas que falham contam para o limite — login bem-sucedido não pune o usuário.
    await Promise.all([
      recordRateLimitEvent(ipKey, "login"),
      recordRateLimitEvent(emailKey, "login"),
    ]);
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
