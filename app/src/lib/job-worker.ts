import { notifyAlert } from "./alerts";
import { prisma } from "./prisma";
import { processNextContentPackageJob } from "./cortex-mvp";
import { runBillingRenewalCycle } from "./billing";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const ALERT_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_BILLING_CYCLE_INTERVAL_MS = 60 * 60 * 1000;
let lastWorkerErrorAlertAt = 0;
let lastBillingCycleAt = 0;

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
    if (result.renewalsCreated || result.markedPastDue) {
      console.log(JSON.stringify({ event: "billing_cycle", ...result }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "billing_cycle_error", error: message }));
  }
}

export async function runWorkerLoop() {
  const pollIntervalMs = Number(process.env.CORTEX_WORKER_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS.toString());
  console.log(JSON.stringify({ event: "worker_started", pollIntervalMs }));

  while (true) {
    const startedAt = Date.now();
    await maybeRunBillingCycle();
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
