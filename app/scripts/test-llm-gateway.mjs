import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const gatewayPath = join(root, "src/lib/llm-gateway.ts");
assert.ok(existsSync(gatewayPath), "LLM Gateway precisa existir em src/lib/llm-gateway.ts");

const gateway = readFileSync(gatewayPath, "utf8");
const requiredGatewayContracts = [
  "generateContentPackageArtifact",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL",
  "OPENAI_COMPATIBLE_MODEL",
  "chat/completions",
  "deterministic-template-v1",
  "inputTokens",
  "outputTokens",
  "costUsd",
  "fallback",
];

for (const text of requiredGatewayContracts) {
  assert.ok(gateway.includes(text), `LLM Gateway sem contrato obrigatório: ${text}`);
}

const mvp = readFileSync(join(root, "src/lib/cortex-mvp.ts"), "utf8");
assert.ok(mvp.includes("generateContentPackageArtifact"), "createContentPackageJob deve usar o LLM Gateway");
assert.ok(mvp.includes("generation.provider"), "ledger deve registrar provider retornado pelo gateway");
assert.ok(mvp.includes("generation.model"), "ledger deve registrar model retornado pelo gateway");
assert.ok(mvp.includes("generation.content"), "artifact deve usar conteúdo retornado pelo gateway");

console.log("LLM Gateway contract OK: provider OpenAI-compatible, fallback e ledger integrados.");
