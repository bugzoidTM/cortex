import { prisma } from "./prisma";
import { processNextContentPackageJob } from "./cortex-mvp";

const DEFAULT_POLL_INTERVAL_MS = 5_000;

export async function runWorkerLoop() {
  const pollIntervalMs = Number(process.env.CORTEX_WORKER_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS.toString());
  console.log(JSON.stringify({ event: "worker_started", pollIntervalMs }));

  while (true) {
    const startedAt = Date.now();
    try {
      const result = await processNextContentPackageJob();
      if (result) {
        console.log(JSON.stringify({ event: "job_processed", jobId: result.job.id, status: result.job.status, latencyMs: Date.now() - startedAt }));
        continue;
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "worker_error", error: error instanceof Error ? error.message : "unknown" }));
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
