import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const SESSION_COOKIE_NAME = "cortex_session";
const SESSION_TTL_DAYS = 14;

type SessionWithTenant = {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string;
  role: string;
};

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function getCurrentSession(): Promise<SessionWithTenant | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { tenant: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date() || !session.user.memberships[0]) {
    return null;
  }

  const membership = session.user.memberships[0];
  return {
    userId: session.userId,
    email: session.user.email,
    name: session.user.name,
    tenantId: membership.tenantId,
    role: membership.role,
  };
}

export async function requireCurrentSession() {
  const session = await getCurrentSession();
  if (!session) {
    throw new AuthRequiredError();
  }
  return session;
}

export function isSuperuserEmail(email: string) {
  const configured = process.env.CORTEX_SUPERUSER_EMAILS ?? "admin@nutef.com";
  return configured
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function requireSuperuserSession() {
  const session = await requireCurrentSession();
  if (!isSuperuserEmail(session.email)) {
    throw new SuperuserRequiredError();
  }
  return session;
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export function setSessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      expires: expiresAt,
    },
  };
}

export class AuthRequiredError extends Error {
  constructor() {
    super("auth_required");
  }
}

export class SuperuserRequiredError extends Error {
  constructor() {
    super("superuser_required");
  }
}
