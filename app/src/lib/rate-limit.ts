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

export async function checkRateLimit({ key, action, limit, windowSeconds }: RateLimitOptions) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  const count = await prisma.rateLimitEvent.count({
    where: { key, action, createdAt: { gte: windowStart } },
  });

  if (count >= limit) {
    throw new RateLimitExceededError("rate_limited", windowSeconds);
  }

  await prisma.rateLimitEvent.create({ data: { key, action } });

  if (Math.random() < 0.02) {
    await prisma.rateLimitEvent.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    });
  }

  return { remaining: Math.max(0, limit - count - 1), limit, windowSeconds };
}

export function jobCreationRateLimitKey(session: { tenantId: string; userId: string }) {
  return `tenant:${session.tenantId}:user:${session.userId}`;
}
