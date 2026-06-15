/**
 * Alertas operacionais best-effort.
 *
 * Envia uma mensagem para CORTEX_ALERT_WEBHOOK_URL (Slack/Discord/etc.) quando
 * algo relevante falha. É sempre não-bloqueante: qualquer erro aqui é engolido
 * para nunca derrubar o fluxo principal (worker, job, backup).
 */
export async function notifyAlert(message: string, context?: Record<string, unknown>) {
  const url = process.env.CORTEX_ALERT_WEBHOOK_URL;
  if (!url) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `[Cortex] ${message}`, context }),
      signal: controller.signal,
    });
  } catch {
    // alerta é best-effort
  } finally {
    clearTimeout(timeout);
  }
}
