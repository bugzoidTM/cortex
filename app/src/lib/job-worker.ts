import { writeFile } from "node:fs/promises";
import { notifyAlert } from "./alerts";
import { prisma } from "./prisma";
import { processNextContentPackageJob, reclaimStaleJobs } from "./cortex-mvp";
import { runBillingRenewalCycle } from "./billing";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const ALERT_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_BILLING_CYCLE_INTERVAL_MS = 60 * 60 * 1000;
const RECLAIM_INTERVAL_MS = 60 * 1000;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Retenção LGPD: e-mails transacionais e sessões/eventos expirados não ficam para sempre.
const EMAIL_RETENTION_DAYS = 90;
// O healthcheck do container lê este arquivo: heartbeat parado = worker morto/travado.
const HEARTBEAT_FILE = process.env.CORTEX_WORKER_HEARTBEAT_FILE ?? "/tmp/cortex-worker-heartbeat";
let lastWorkerErrorAlertAt = 0;
let lastBillingCycleAt = 0;
let lastReclaimAt = 0;
let lastRetentionAt = 0;

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
    const result = await reclaimStaleJobs();
    if (result.requeued || result.failed) {
      console.log(JSON.stringify({ event: "stale_jobs_reclaimed", ...result }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "stale_jobs_reclaim_error", error: message }));
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
    const [emails, sessions, rateEvents] = await Promise.all([
      prisma.emailMessage.deleteMany({ where: { createdAt: { lt: emailCutoff } } }),
      prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } }),
      prisma.rateLimitEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } }),
    ]);
    if (emails.count || sessions.count || rateEvents.count) {
      console.log(JSON.stringify({ event: "retention_cycle", emails: emails.count, sessions: sessions.count, rateEvents: rateEvents.count }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "retention_cycle_error", error: message }));
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
    try {
      const result = await processNextContentPackageJob();
      if (result) {
        console.log(JSON.stringify({ event: "job_processed", jobId: result.job.id, status: result.job.status, latencyMs: Date.now() - startedAt }));
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
