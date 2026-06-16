import { createHash } from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, ipRateLimitKey, RateLimitExceededError } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(12).max(160) });

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    await checkRateLimit({
      key: ipRateLimitKey("reset_password", getClientIp(request)),
      action: "reset_password",
      limit: 10,
      windowSeconds: 60 * 60,
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: tokenHash(parsed.data.token) } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return Response.json({ ok: false, error: "invalid_or_expired_token" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash: hashPassword(parsed.data.password) } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  return Response.json({ ok: true });
}
