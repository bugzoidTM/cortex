import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { readSecretEnv } from "./runtime-config";

export const TRIAL_DAYS = 14;
const ENCRYPTION_SECRET_ENV = "CORTEX_BYOK_ENCRYPTION_SECRET";

export const tenantLlmCredentialInputSchema = z.object({
  provider: z.string().min(2).max(80).default("openai-compatible"),
  baseUrl: z.string().url(),
  model: z.string().min(2).max(120),
  apiKey: z.string().min(8).max(4096),
});

type TenantCredentialRow = {
  id: string;
  provider: string;
  baseUrl: string;
  model: string;
  encryptedApiKey: string;
  apiKeyPreview: string;
  trialStartedAt: Date;
  trialEndsAt: Date;
  enabled: boolean;
  updatedAt: Date;
};

export type ActiveTenantLlmCredential = {
  id: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyPreview: string;
  trialStartedAt: Date;
  trialEndsAt: Date;
  trialActive: boolean;
  byokTrial: true;
};

export type PublicTenantLlmCredential = {
  configured: boolean;
  provider: string | null;
  baseUrl: string | null;
  model: string | null;
  apiKeyPreview: string | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialActive: boolean;
  enabled: boolean;
  updatedAt: Date | null;
};

export async function getTenantLlmCredentialStatus(tenantId: string): Promise<PublicTenantLlmCredential> {
  const credential = (await prisma.tenantLlmCredential.findUnique({ where: { tenantId } })) as TenantCredentialRow | null;
  if (!credential) {
    return {
      configured: false,
      provider: null,
      baseUrl: null,
      model: null,
      apiKeyPreview: null,
      trialStartedAt: null,
      trialEndsAt: null,
      trialActive: false,
      enabled: false,
      updatedAt: null,
    };
  }

  return publicStatus(credential);
}

export async function getActiveTenantLlmCredential(tenantId?: string | null): Promise<ActiveTenantLlmCredential | null> {
  if (!tenantId) return null;

  const credential = (await prisma.tenantLlmCredential.findUnique({ where: { tenantId } })) as TenantCredentialRow | null;
  if (!credential || !credential.enabled || credential.trialEndsAt <= new Date()) {
    return null;
  }

  return {
    id: credential.id,
    provider: credential.provider,
    baseUrl: credential.baseUrl,
    model: credential.model,
    apiKey: decryptApiKey(credential.encryptedApiKey),
    apiKeyPreview: credential.apiKeyPreview,
    trialStartedAt: credential.trialStartedAt,
    trialEndsAt: credential.trialEndsAt,
    trialActive: true,
    byokTrial: true,
  };
}

export async function upsertTenantLlmCredential(tenantId: string, input: unknown): Promise<PublicTenantLlmCredential> {
  const parsed = tenantLlmCredentialInputSchema.parse(input);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const credential = (await prisma.tenantLlmCredential.upsert({
    where: { tenantId },
    update: {
      provider: parsed.provider,
      baseUrl: parsed.baseUrl,
      model: parsed.model,
      encryptedApiKey: encryptApiKey(parsed.apiKey),
      apiKeyPreview: previewApiKey(parsed.apiKey),
      trialStartedAt: now,
      trialEndsAt,
      enabled: true,
    },
    create: {
      tenantId,
      provider: parsed.provider,
      baseUrl: parsed.baseUrl,
      model: parsed.model,
      encryptedApiKey: encryptApiKey(parsed.apiKey),
      apiKeyPreview: previewApiKey(parsed.apiKey),
      trialStartedAt: now,
      trialEndsAt,
      enabled: true,
    },
  })) as TenantCredentialRow;

  return publicStatus(credential);
}

export async function deleteTenantLlmCredential(tenantId: string) {
  await prisma.tenantLlmCredential.deleteMany({ where: { tenantId } });
  return getTenantLlmCredentialStatus(tenantId);
}

function publicStatus(credential: TenantCredentialRow): PublicTenantLlmCredential {
  const trialActive = credential.enabled && credential.trialEndsAt > new Date();
  return {
    configured: true,
    provider: credential.provider,
    baseUrl: maskBaseUrl(credential.baseUrl),
    model: credential.model,
    apiKeyPreview: credential.apiKeyPreview,
    trialStartedAt: credential.trialStartedAt,
    trialEndsAt: credential.trialEndsAt,
    trialActive,
    enabled: credential.enabled,
    updatedAt: credential.updatedAt,
  };
}

function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

function decryptApiKey(payload: string) {
  const [ivValue, tagValue, encryptedValue] = payload.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("invalid_byok_ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

function getEncryptionKey() {
  const secret = readSecretEnv(ENCRYPTION_SECRET_ENV);
  if (!secret || secret.length < 32) {
    throw new Error(`${ENCRYPTION_SECRET_ENV}_missing_or_too_short`);
  }
  return createHash("sha256").update(secret).digest();
}

function previewApiKey(apiKey: string) {
  const normalized = apiKey.trim();
  if (normalized.length <= 10) return "••••";
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
}

function maskBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "invalid-url";
  }
}
