import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const gatewayPath = join(root, "src/lib/llm-gateway.ts");
assert.ok(existsSync(gatewayPath), "LLM Gateway precisa existir em src/lib/llm-gateway.ts");

const gateway = readFileSync(gatewayPath, "utf8");
const requiredGatewayContracts = [
  "generateContentPackageArtifact",
  "getActiveLlmProviderConfig",
  "OPENAI_COMPATIBLE_API_KEY",
  "chat/completions",
  "deterministic-template-v1",
  "inputTokens",
  "outputTokens",
  "costUsd",
  "inputCostPer1M",
  "outputCostPer1M",
  "llmProviderConfigId",
  "fallback",
];

for (const text of requiredGatewayContracts) {
  assert.ok(gateway.includes(text), `LLM Gateway sem contrato obrigatório: ${text}`);
}

const mvp = readFileSync(join(root, "src/lib/cortex-mvp.ts"), "utf8");
assert.ok(mvp.includes("generateContentPackageArtifact"), "createContentPackageJob deve usar o LLM Gateway");
assert.ok(mvp.includes("job.tenantId"), "LLM Gateway deve receber tenantId para escolher configuração do banco");
assert.ok(mvp.includes("generation.provider"), "ledger deve registrar provider retornado pelo gateway");
assert.ok(mvp.includes("generation.model"), "ledger deve registrar model retornado pelo gateway");
assert.ok(mvp.includes("generation.inputCostPer1M"), "ledger deve registrar snapshot do custo de entrada usado");
assert.ok(mvp.includes("generation.outputCostPer1M"), "ledger deve registrar snapshot do custo de saída usado");
assert.ok(mvp.includes("generation.content"), "artifact deve usar conteúdo retornado pelo gateway");

console.log("LLM Gateway contract OK: provider OpenAI-compatible, fallback e ledger integrados.");
