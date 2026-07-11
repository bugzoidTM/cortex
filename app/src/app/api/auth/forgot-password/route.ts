import { createHash, randomBytes } from "node:crypto";
import { sendTransactionalEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, ipRateLimitKey, RateLimitExceededError } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Cria PasswordResetToken e envia e-mail transacional quando o usuário existe.

const schema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()) });

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    await checkRateLimit({
      key: ipRateLimitKey("forgot_password", getClientIp(request)),
      action: "forgot_password",
      limit: 5,
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

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const baseUrl = process.env.CORTEX_PUBLIC_URL ?? "https://cortex.nutef.com";
    const resetUrl = `${baseUrl}/?resetToken=${encodeURIComponent(token)}#acesso`;
    // O registro persistido em EmailMessage guarda o link SEM o token: o token cru só
    // existe no e-mail entregue (persistir o corpo real anularia o hash do PasswordResetToken).
    const redactedUrl = `${baseUrl}/?resetToken=[redigido]#acesso`;
    await sendTransactionalEmail({
      to: user.email,
      userId: user.id,
      subject: "Redefinição de senha do Cortex",
      text: `Use este link em até 1 hora para redefinir sua senha: ${resetUrl}`,
      html: `<p>Use este link em até 1 hora para redefinir sua senha:</p><p><a href="${resetUrl}">Redefinir senha</a></p>`,
      storageText: `Use este link em até 1 hora para redefinir sua senha: ${redactedUrl}`,
      storageHtml: `<p>Use este link em até 1 hora para redefinir sua senha:</p><p><a href="${redactedUrl}">Redefinir senha</a></p>`,
    }).catch(() => null);
  }

  return Response.json({ ok: true });
}
