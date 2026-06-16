import { prisma } from "./prisma";

export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

type RateLimitOptions = {
  key: string;
  action: string;
  limit: number;
  windowSeconds: number;
};

async function countEvents(key: string, action: string, windowSeconds: number) {
  const windowStart = new Date(Date.now() - windowSeconds * 1000);
  return prisma.rateLimitEvent.count({
    where: { key, action, createdAt: { gte: windowStart } },
  });
}

async function pruneOldEventsOccasionally() {
  if (Math.random() < 0.02) {
    await prisma.rateLimitEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  }
}

export async function recordRateLimitEvent(key: string, action: string) {
  await prisma.rateLimitEvent.create({ data: { key, action } });
  await pruneOldEventsOccasionally();
}

export async function checkRateLimit({ key, action, limit, windowSeconds }: RateLimitOptions) {
  const count = await countEvents(key, action, windowSeconds);

  if (count >= limit) {
    throw new RateLimitExceededError("rate_limited", windowSeconds);
  }

  await recordRateLimitEvent(key, action);

  return { remaining: Math.max(0, limit - count - 1), limit, windowSeconds };
}

// Verifica o limite sem registrar evento. Usado no login, onde só queremos
// contabilizar tentativas que falharam (evita travar usuário legítimo).
export async function assertWithinRateLimit({ key, action, limit, windowSeconds }: RateLimitOptions) {
  const count = await countEvents(key, action, windowSeconds);

  if (count >= limit) {
    throw new RateLimitExceededError("rate_limited", windowSeconds);
  }

  return { remaining: Math.max(0, limit - count), limit, windowSeconds };
}

export function jobCreationRateLimitKey(session: { tenantId: string; userId: string }) {
  return `tenant:${session.tenantId}:user:${session.userId}`;
}

export function loginIpRateLimitKey(ip: string) {
  return `login:ip:${ip}`;
}

export function loginEmailRateLimitKey(email: string) {
  return `login:email:${email.toLowerCase()}`;
}

// Extrai o IP do cliente respeitando o proxy reverso (Traefik) à frente do app.
export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function ipRateLimitKey(scope: string, ip: string) {
  return `${scope}:ip:${ip}`;
}
