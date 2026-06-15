import { readSecretEnv } from "./runtime-config";

const DEFAULT_WOOVI_API_BASE_URL = "https://api.woovi.com";

type WooviChargeInput = {
  correlationID: string;
  value: number;
  comment: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
    taxID?: string;
  };
  expiresIn?: number;
};

type WooviChargeResponse = {
  charge?: {
    identifier?: string;
    correlationID?: string;
    paymentLinkUrl?: string;
    brCode?: string;
    qrCodeImage?: string;
    expiresDate?: string;
    status?: string;
  };
  paymentLinkUrl?: string;
  brCode?: string;
  qrCodeImage?: string;
  correlationID?: string;
  identifier?: string;
  expiresDate?: string;
  errors?: Array<{ message?: string }>;
};

export function getWooviRuntimeStatus() {
  const appID = readSecretEnv("WOOVI_APP_ID");
  const webhookSecret = readSecretEnv("CORTEX_WOOVI_WEBHOOK_SECRET");
  const baseUrl = process.env.WOOVI_API_BASE_URL ?? DEFAULT_WOOVI_API_BASE_URL;
  return {
    configured: Boolean(appID),
    apiKeySource: appID ? (process.env.WOOVI_APP_ID ? "env" : "file") : "missing",
    webhookSecretConfigured: Boolean(webhookSecret),
    baseUrl: maskBaseUrl(baseUrl),
  };
}

export async function createWooviCharge(input: WooviChargeInput) {
  const appID = readSecretEnv("WOOVI_APP_ID");
  if (!appID) {
    throw new Error("woovi_app_id_missing");
  }

  const baseUrl = (process.env.WOOVI_API_BASE_URL ?? DEFAULT_WOOVI_API_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/v1/charge`, {
    method: "POST",
    headers: {
      Authorization: appID,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      correlationID: input.correlationID,
      value: input.value,
      comment: input.comment,
      customer: input.customer,
      expiresIn: input.expiresIn ?? 86400,
    }),
  });

  const payload = (await response.json().catch(() => null)) as WooviChargeResponse | null;
  if (!response.ok || !payload) {
    const message = payload?.errors?.[0]?.message ?? `woovi_http_${response.status}`;
    throw new Error(message);
  }

  const charge = payload.charge ?? payload;
  return {
    raw: payload,
    wooviChargeId: charge.identifier ?? payload.identifier ?? null,
    correlationID: charge.correlationID ?? payload.correlationID ?? input.correlationID,
    paymentLinkUrl: charge.paymentLinkUrl ?? payload.paymentLinkUrl ?? null,
    brCode: charge.brCode ?? payload.brCode ?? null,
    qrCodeImage: charge.qrCodeImage ?? payload.qrCodeImage ?? null,
    expiresAt: charge.expiresDate ? new Date(charge.expiresDate) : new Date(Date.now() + (input.expiresIn ?? 86400) * 1000),
  };
}

export function getWooviWebhookSecret() {
  return readSecretEnv("CORTEX_WOOVI_WEBHOOK_SECRET");
}

function maskBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "invalid-url";
  }
}
