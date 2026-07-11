import { handleWooviChargeCompleted } from "@/lib/billing";
import { notifyAlert } from "@/lib/alerts";
import { getWooviWebhookSecret } from "@/lib/woovi";

export const dynamic = "force-dynamic";

const WEBHOOK_SECRET_ENV = "CORTEX_WOOVI_WEBHOOK_SECRET";

type WooviWebhookBody = {
  event?: string;
  correlationID?: string;
  charge?: { correlationID?: string };
  pix?: { charge?: { correlationID?: string } };
};

function extractCorrelationID(payload: WooviWebhookBody) {
  return payload.charge?.correlationID ?? payload.pix?.charge?.correlationID ?? payload.correlationID ?? null;
}

function isRecordNotFound(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2025",
  );
}

// A Woovi valida a URL no cadastro do webhook (e pode fazer health checks) — respondemos 200.
export async function GET() {
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as WooviWebhookBody | null;
  if (!payload) {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (payload.event !== "OPENPIX:CHARGE_COMPLETED") {
    return Response.json({ ok: true, ignored: true, event: payload.event ?? null });
  }

  // O ping de validação da Woovi chega como CHARGE_COMPLETED sem correlationID resolvível.
  // Como não há mutação, reconhecemos com 200 (sem exigir o segredo) para não quebrar o cadastro.
  const correlationID = extractCorrelationID(payload);
  if (!correlationID) {
    return Response.json({ ok: true, ignored: true, reason: "missing_correlation_id" });
  }

  // O segredo protege a confirmação real de pagamento (mutação da assinatura para ACTIVE).
  const expectedSecret = getWooviWebhookSecret();
  // Em produção, falha fechado: sem segredo configurado não processamos cobrança real.
  if (!expectedSecret && process.env.NODE_ENV === "production") {
    return Response.json({ ok: false, error: "webhook_secret_not_configured", secretEnv: WEBHOOK_SECRET_ENV }, { status: 500 });
  }
  const receivedSecret = request.headers.get("authorization")?.trim();
  if (expectedSecret && receivedSecret !== expectedSecret) {
    return Response.json({ ok: false, error: "invalid_webhook_authorization", secretEnv: WEBHOOK_SECRET_ENV }, { status: 401 });
  }

  try {
    const result = await handleWooviChargeCompleted(payload);
    return Response.json({ ok: true, event: "OPENPIX:CHARGE_COMPLETED", correlationID: result.invoice.wooviCorrelationID });
  } catch (error) {
    // Cobrança desconhecida (ex.: cobrança de teste enviada pela Woovi) — reconhece e ignora,
    // mas avisa o operador: pode ser pagamento real sem conta provisionada (checkout que falhou no meio).
    if (isRecordNotFound(error)) {
      await notifyAlert("Webhook Woovi: CHARGE_COMPLETED sem invoice correspondente", { correlationID });
      return Response.json({ ok: true, ignored: true, reason: "charge_not_found" });
    }
    throw error;
  }
}
