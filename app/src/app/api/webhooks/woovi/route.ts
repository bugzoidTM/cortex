import { handleWooviChargeCompleted } from "@/lib/billing";
import { getWooviWebhookSecret } from "@/lib/woovi";

export const dynamic = "force-dynamic";

const WEBHOOK_SECRET_ENV = "CORTEX_WOOVI_WEBHOOK_SECRET";

export async function POST(request: Request) {
  const expectedSecret = getWooviWebhookSecret();
  const receivedSecret = request.headers.get("authorization")?.trim();
  if (expectedSecret && receivedSecret !== expectedSecret) {
    return Response.json({ ok: false, error: "invalid_webhook_authorization", secretEnv: WEBHOOK_SECRET_ENV }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (payload.event !== "OPENPIX:CHARGE_COMPLETED") {
    return Response.json({ ok: true, ignored: true, event: payload.event ?? null });
  }

  const result = await handleWooviChargeCompleted(payload);
  return Response.json({ ok: true, event: "OPENPIX:CHARGE_COMPLETED", correlationID: result.invoice.wooviCorrelationID });
}
