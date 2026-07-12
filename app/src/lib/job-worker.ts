import { writeFile } from "node:fs/promises";
import { notifyAlert } from "./alerts";
import { prisma } from "./prisma";
import { processNextContentPackageJob, reclaimStaleJobs } from "./cortex-mvp";
import { runBillingRenewalCycle } from "./billing";
import { processNextPublication, reclaimStalePublications, runSocialExpiryNoticeCycle } from "./social";
import { pruneOldMediaAssets } from "./media";
import { runCeoReportCycle } from "./ceo-report";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const ALERT_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_BILLING_CYCLE_INTERVAL_MS = 60 * 60 * 1000;
const RECLAIM_INTERVAL_MS = 60 * 1000;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SOCIAL_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
// Retenção LGPD: e-mails transacionais e sessões/eventos expirados não ficam para sempre.
const EMAIL_RETENTION_DAYS = 90;
// O healthcheck do container lê este arquivo: heartbeat parado = worker morto/travado.
const HEARTBEAT_FILE = process.env.CORTEX_WORKER_HEARTBEAT_FILE ?? "/tmp/cortex-worker-heartbeat";
let lastWorkerErrorAlertAt = 0;
let lastBillingCycleAt = 0;
let lastReclaimAt = 0;
let lastRetentionAt = 0;
let lastSocialExpiryAt = 0;
let lastCeoReportCheckAt = 0;

// Recorrência mensal: gera cobranças de renovação e marca inadimplência, gated por intervalo.
async function maybeRunBillingCycle() {
  const intervalMs = Number(process.env.CORTEX_BILLING_CYCLE_INTERVAL_MS ?? DEFAULT_BILLING_CYCLE_INTERVAL_MS.toString());
  const now = Date.now();
  if (now - lastBillingCycleAt < intervalMs) {
    return;
  }
  lastBillingCycleAt = now;
  try {
    const result = await runBillingRenewalCycle();
    if (result.renewalsCreated || result.markedPastDue || result.expiredInvoices || result.canceledSubscriptions || result.abandonedCheckoutsCleaned) {
      console.log(JSON.stringify({ event: "billing_cycle", ...result }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "billing_cycle_error", error: message }));
  }
}

async function maybeReclaimStaleJobs() {
  const now = Date.now();
  if (now - lastReclaimAt < RECLAIM_INTERVAL_MS) {
    return;
  }
  lastReclaimAt = now;
  try {
    const [jobs, pubs] = await Promise.all([reclaimStaleJobs(), reclaimStalePublications()]);
    if (jobs.requeued || jobs.failed) {
      console.log(JSON.stringify({ event: "stale_jobs_reclaimed", ...jobs }));
    }
    if (pubs.requeued || pubs.failed) {
      console.log(JSON.stringify({ event: "stale_publications_reclaimed", ...pubs }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "stale_jobs_reclaim_error", error: message }));
  }
}

async function maybeRunSocialExpiryCycle() {
  const now = Date.now();
  if (now - lastSocialExpiryAt < SOCIAL_EXPIRY_INTERVAL_MS) {
    return;
  }
  lastSocialExpiryAt = now;
  try {
    const result = await runSocialExpiryNoticeCycle();
    if (result.notified || result.markedExpired || result.refreshed) {
      console.log(JSON.stringify({ event: "social_expiry_cycle", ...result }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "social_expiry_cycle_error", error: message }));
  }
}

async function maybeRunRetentionCycle() {
  const now = Date.now();
  if (now - lastRetentionAt < RETENTION_INTERVAL_MS) {
    return;
  }
  lastRetentionAt = now;
  try {
    const emailCutoff = new Date(now - EMAIL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const [emails, sessions, rateEvents, media] = await Promise.all([
      prisma.emailMessage.deleteMany({ where: { createdAt: { lt: emailCutoff } } }),
      prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } }),
      prisma.rateLimitEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } }),
      pruneOldMediaAssets(new Date(now)),
    ]);
    if (emails.count || sessions.count || rateEvents.count || media) {
      console.log(JSON.stringify({ event: "retention_cycle", emails: emails.count, sessions: sessions.count, rateEvents: rateEvents.count, media }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "retention_cycle_error", error: message }));
  }
}

// Agente CEO: checa a cada 10 min; o próprio ciclo garante 1 envio/dia (hora-alvo
// + idempotência via EmailMessage, que sobrevive a restart do worker).
async function maybeRunCeoReport() {
  const now = Date.now();
  if (now - lastCeoReportCheckAt < 10 * 60 * 1000) {
    return;
  }
  lastCeoReportCheckAt = now;
  try {
    const result = await runCeoReportCycle();
    if (result.sent) {
      console.log(JSON.stringify({ event: "ceo_report_sent" }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "ceo_report_error", error: message }));
  }
}

async function writeHeartbeat() {
  try {
    await writeFile(HEARTBEAT_FILE, Date.now().toString(), "utf8");
  } catch {
    // heartbeat é best-effort
  }
}

export async function runWorkerLoop() {
  const pollIntervalMs = Number(process.env.CORTEX_WORKER_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS.toString());
  console.log(JSON.stringify({ event: "worker_started", pollIntervalMs }));

  // Timer independente do loop: o heartbeat continua batendo mesmo durante uma geração longa
  // (o await do LLM não bloqueia o event loop), então o healthcheck não mata worker ocupado.
  await writeHeartbeat();
  setInterval(() => {
    void writeHeartbeat();
  }, 15_000);

  while (true) {
    const startedAt = Date.now();
    await maybeRunBillingCycle();
    await maybeReclaimStaleJobs();
    await maybeRunRetentionCycle();
    await maybeRunSocialExpiryCycle();
    await maybeRunCeoReport();
    try {
      const result = await processNextContentPackageJob();
      if (result) {
        console.log(JSON.stringify({ event: "job_processed", jobId: result.job.id, status: result.job.status, latencyMs: Date.now() - startedAt }));
        continue;
      }
      // Sem job de geração pendente: tenta publicar uma peça aprovada da fila.
      const published = await processNextPublication();
      if (published) {
        console.log(JSON.stringify({ event: "publication_processed", publicationId: published.id, status: published.status, latencyMs: Date.now() - startedAt }));
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error(JSON.stringify({ event: "worker_error", error: message }));
      const now = Date.now();
      if (now - lastWorkerErrorAlertAt > ALERT_THROTTLE_MS) {
        lastWorkerErrorAlertAt = now;
        await notifyAlert("Erro no worker de jobs", { error: message });
      }
    }
    await sleep(pollIntervalMs);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv[1]?.endsWith("job-worker.ts")) {
  runWorkerLoop()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
