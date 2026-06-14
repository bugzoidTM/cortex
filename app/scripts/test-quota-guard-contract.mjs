import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const mvpPath = join(root, "src/lib/cortex-mvp.ts");
const gatewayPath = join(root, "src/lib/llm-gateway.ts");
const jobsRoutePath = join(root, "src/app/api/jobs/route.ts");
const uiPath = join(root, "src/app/components/cortex-job-console.tsx");

for (const path of [mvpPath, gatewayPath, jobsRoutePath, uiPath]) {
  assert.ok(existsSync(path), `Arquivo esperado ausente: ${path}`);
}

assert.equal(packageJson.scripts?.["test:quota-guard"], "node scripts/test-quota-guard-contract.mjs", "package.json precisa expor npm run test:quota-guard");

const mvp = readFileSync(mvpPath, "utf8");
assert.match(mvp, /monthlyQuota/, "Tenant monthlyQuota precisa ser usado na lógica de quota");
assert.match(mvp, /getTenantQuotaStatus/, "Precisa exportar getTenantQuotaStatus para quota mensal");
assert.match(mvp, /QuotaExceededError/, "Precisa ter erro explícito de quota excedida");
assert.match(mvp, /estimateJobTokenUsage/, "Precisa estimar tokens antes de criar job");
assert.match(mvp, /remainingTokens/, "Status da quota deve expor tokens restantes");
assert.match(mvp, /quotaStatus/, "Snapshots/jobs devem retornar quotaStatus para UI");

const route = readFileSync(jobsRoutePath, "utf8");
assert.match(route, /QuotaExceededError/, "POST /api/jobs deve tratar QuotaExceededError");
assert.match(route, /quota_exceeded/, "POST /api/jobs deve retornar error=quota_exceeded");
assert.match(route, /402/, "Quota excedida deve retornar HTTP 402");
assert.match(route, /quotaStatus/, "GET/POST /api/jobs deve devolver quotaStatus");

const gateway = readFileSync(gatewayPath, "utf8");
assert.match(gateway, /OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS/, "Gateway deve suportar limite configurável de tokens por execução");
assert.match(gateway, /max_tokens/, "Gateway deve enviar max_tokens ao provider OpenAI-compatible");

const ui = readFileSync(uiPath, "utf8");
assert.match(ui, /quotaStatus/, "UI deve conhecer quotaStatus");
assert.match(ui, /Quota mensal/, "UI deve exibir quota mensal");
assert.match(ui, /tokens restantes/, "UI deve exibir tokens restantes");

console.log("Quota guard contract OK: limite mensal, limite por execução e UI de quota estão conectados.");
