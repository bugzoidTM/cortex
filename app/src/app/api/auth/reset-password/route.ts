import { createHash } from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(12).max(160) });

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
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
