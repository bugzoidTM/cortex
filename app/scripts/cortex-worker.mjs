import { spawn } from "node:child_process";

const child = spawn("npx", ["tsx", "src/lib/job-worker.ts"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`cortex worker stopped by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
