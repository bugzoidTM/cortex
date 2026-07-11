import { createSession, hashPassword, isSuperuserEmail, setSessionCookie } from "@/lib/auth";
import { uniqueTenantSlug } from "@/lib/billing";
import { sendTransactionalEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, ipRateLimitKey, RateLimitExceededError } from "@/lib/rate-limit";
import { TRIAL_ACCOUNT_DAYS, TRIAL_MONTHLY_QUOTA, TRIAL_PLAN, trialEndsAtFor } from "@/lib/trial";
import { cookies } from "next/headers";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Registro self-service do teste de 14 dias: conta nasce sem pagamento, no plano trial,
// e só gera conteúdo com a chave API do próprio cliente (BYOK).

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().min(2).max(120),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(160),
});

const REGISTER_WINDOW_SECONDS = 60 * 60;
const REGISTER_MAX_PER_IP = 5;

export async function POST(request: Request) {
  try {
    await checkRateLimit({
      key: ipRateLimitKey("register", getClientIp(request)),
      action: "register",
      limit: REGISTER_MAX_PER_IP,
      windowSeconds: REGISTER_WINDOW_SECONDS,
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_input", issues: parsed.error.flatten() }, { status: 400 });
  }

  // E-mails de superuser nunca nascem por autoatendimento.
  if (isSuperuserEmail(parsed.data.email)) {
    return Response.json({ ok: false, error: "email_already_registered" }, { status: 409 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return Response.json({ ok: false, error: "email_already_registered" }, { status: 409 });
  }

  const slug = await uniqueTenantSlug(parsed.data.company);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        slug,
        name: parsed.data.company,
        plan: TRIAL_PLAN,
        monthlyQuota: TRIAL_MONTHLY_QUOTA,
        brandProfile: {
          create: {
            tone: "formal, claro, objetivo e humano",
            audience: "cliente em teste do Cortex",
            promise: "gerar conteúdo útil no tom da marca com revisão humana",
            restrictions: ["sem promessas irreais", "sem jargão de guru"],
            sampleContent: "Conteúdo prático, verificável e orientado a resultado.",
          },
        },
      },
    });

    const user = await tx.user.create({
      data: { email: parsed.data.email, name: parsed.data.name, passwordHash: hashPassword(parsed.data.password) },
    });

    await tx.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role: "owner" } });

    return { tenant, user };
  });

  const session = await createSession(result.user.id);
  const cookie = setSessionCookie(session.token, session.expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, cookie.options);

  const trialEndsAt = trialEndsAtFor(result.tenant.createdAt);
  await sendTransactionalEmail({
    to: result.user.email,
    userId: result.user.id,
    subject: `Seu teste de ${TRIAL_ACCOUNT_DAYS} dias no Cortex começou`,
    text: [
      `Olá ${parsed.data.name}, sua conta de teste do Cortex está pronta e vale até ${trialEndsAt.toLocaleDateString("pt-BR")}.`,
      "",
      "Próximos passos:",
      "1. Entre no console: https://cortex.nutef.com/#acesso",
      "2. Cadastre sua própria chave API OpenAI-compatible (seção Teste de 14 dias).",
      "3. Ajuste a voz da marca e crie seu primeiro pacote de conteúdo.",
      "",
      "Quando quiser o LLM gerenciado pela Nutef, assine um plano pago pelo checkout Pix na própria página.",
    ].join("\n"),
  }).catch(() => null);

  return Response.json(
    {
      ok: true,
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      tenantId: result.tenant.id,
      trialEndsAt,
    },
    { status: 201 },
  );
}
