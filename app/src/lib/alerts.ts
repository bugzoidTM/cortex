/**
 * Alertas operacionais best-effort.
 *
 * Envia a mensagem para CORTEX_ALERT_WEBHOOK_URL (Slack/Discord/etc.) quando configurado
 * e/ou por e-mail para CORTEX_ALERT_EMAIL (usa o SMTP transacional já existente).
 * É sempre não-bloqueante: qualquer erro aqui é engolido para nunca derrubar o fluxo
 * principal (worker, job, backup).
 */
export async function notifyAlert(message: string, context?: Record<string, unknown>) {
  await Promise.all([notifyWebhook(message, context), notifyEmail(message, context)]);
}

async function notifyWebhook(message: string, context?: Record<string, unknown>) {
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

async function notifyEmail(message: string, context?: Record<string, unknown>) {
  const to = process.env.CORTEX_ALERT_EMAIL;
  if (!to) {
    return;
  }

  try {
    // Import dinâmico para evitar ciclo (email.ts não conhece alerts.ts, mas quem envia e-mail pode alertar).
    const { sendTransactionalEmail } = await import("./email");
    await sendTransactionalEmail({
      to,
      subject: `[Cortex alerta] ${message.slice(0, 120)}`,
      text: `${message}\n\nContexto:\n${JSON.stringify(context ?? {}, null, 2)}`,
    });
  } catch {
    // alerta é best-effort
  }
}
