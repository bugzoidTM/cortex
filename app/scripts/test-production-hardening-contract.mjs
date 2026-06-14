import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = process.cwd();
const repoRoot = join(appRoot, "..");
const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
const schema = readFileSync(join(appRoot, "prisma/schema.prisma"), "utf8");
const jobsRoute = readFileSync(join(appRoot, "src/app/api/jobs/route.ts"), "utf8");
const mvp = readFileSync(join(appRoot, "src/lib/cortex-mvp.ts"), "utf8");
const stack = readFileSync(join(repoRoot, "deploy/cortex-stack.yml"), "utf8");
const backupScript = readFileSync(join(appRoot, "scripts/backup-postgres.sh"), "utf8");

assert.equal(packageJson.scripts?.["test:production-hardening"], "node scripts/test-production-hardening-contract.mjs", "package.json precisa expor npm run test:production-hardening");

for (const file of ["src/lib/job-worker.ts", "src/lib/rate-limit.ts", "scripts/cortex-worker.mjs", "scripts/backup-postgres.sh"]) {
  assert.ok(existsSync(join(appRoot, file)), `Arquivo obrigatório ausente: ${file}`);
}

assert.match(schema, /model\s+RateLimitEvent\b/, "Prisma precisa ter RateLimitEvent para rate limit persistente");
assert.match(schema, /attempts\s+Int\s+@default\(0\)/, "SkillJob precisa rastrear attempts do worker");
assert.match(schema, /lockedAt\s+DateTime\?/, "SkillJob precisa ter lockedAt para claim de worker");

assert.match(jobsRoute, /checkRateLimit/, "POST /api/jobs precisa chamar checkRateLimit");
assert.match(jobsRoute, /RateLimitExceededError/, "POST /api/jobs precisa tratar RateLimitExceededError");
assert.match(jobsRoute, /rate_limited/, "POST /api/jobs precisa retornar error rate_limited");
assert.match(jobsRoute, /429/, "Rate limit precisa retornar HTTP 429");
assert.match(jobsRoute, /enqueueContentPackageJob/, "POST /api/jobs deve enfileirar job, não executar LLM diretamente");
assert.doesNotMatch(jobsRoute, /createContentPackageJob\(/, "POST /api/jobs não deve chamar geração síncrona antiga");

assert.match(mvp, /enqueueContentPackageJob/, "cortex-mvp precisa exportar enqueueContentPackageJob");
assert.match(mvp, /status:\s*"PENDING"/, "enqueue deve criar job PENDING");
assert.match(mvp, /processContentPackageJob/, "cortex-mvp precisa exportar processContentPackageJob para worker");
assert.match(mvp, /status:\s*"PROCESSING"/, "worker deve marcar PROCESSING");
assert.match(mvp, /status:\s*"COMPLETED"/, "worker deve marcar COMPLETED");
assert.match(mvp, /status:\s*"FAILED"/, "worker deve marcar FAILED em erro");

assert.match(stack, /worker:/, "Swarm stack precisa ter serviço worker");
assert.match(stack, /node scripts\/cortex-worker\.mjs/, "worker deve executar scripts/cortex-worker.mjs");
assert.match(stack, /backup:/, "Swarm stack precisa ter serviço backup");
assert.match(backupScript, /pg_dump/, "backup precisa usar pg_dump");
assert.match(stack, /cortex_postgres_backups/, "backup precisa persistir em volume cortex_postgres_backups");

console.log("Production hardening contract OK: fila/worker, rate limit e backup diário estão conectados.");
