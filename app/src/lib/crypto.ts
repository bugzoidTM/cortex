import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readSecretEnv } from "./runtime-config";

// Cripto de propósito geral para segredos guardados no banco (tokens de rede social)
// e assinatura de state OAuth. Mesmo esquema AES-256-GCM do BYOK (iv:tag:ciphertext),
// aqui com um segredo próprio para não misturar chaves de propósitos diferentes.
const SOCIAL_SECRET_ENV = "CORTEX_SOCIAL_TOKEN_SECRET";

function keyFromSecret(envName: string) {
  const secret = readSecretEnv(envName);
  if (!secret || secret.length < 32) {
    throw new Error(`${envName}_missing_or_too_short`);
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string, envName = SOCIAL_SECRET_ENV) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(envName), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(payload: string, envName = SOCIAL_SECRET_ENV) {
  const [ivValue, tagValue, encryptedValue] = payload.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("invalid_ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(envName), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

// Assinatura HMAC do parâmetro `state` do OAuth (anti-CSRF, com validade curta).
// O payload viaja em claro (não é segredo), o HMAC garante integridade/origem.
export function signState(payload: Record<string, unknown>, envName = SOCIAL_SECRET_ENV) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", keyFromSecret(envName)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState<T = Record<string, unknown>>(state: string, maxAgeMs: number, envName = SOCIAL_SECRET_ENV): T | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;

  const expected = createHmac("sha256", keyFromSecret(envName)).update(body).digest();
  const provided = Buffer.from(mac, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { ts?: number } & T;
    if (typeof payload.ts !== "number" || Date.now() - payload.ts > maxAgeMs) {
      return null;
    }
    return payload as T;
  } catch {
    return null;
  }
}
