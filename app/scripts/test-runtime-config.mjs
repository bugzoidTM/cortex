import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const configPath = join(root, "src/lib/runtime-config.ts");
const providerConfigPath = join(root, "src/lib/llm-provider-config.ts");
const statusRoutePath = join(root, "src/app/api/runtime/route.ts");

assert.ok(existsSync(configPath), "Runtime config helper precisa existir em src/lib/runtime-config.ts");
assert.ok(existsSync(providerConfigPath), "Configuração de provider LLM precisa existir em src/lib/llm-provider-config.ts");
assert.ok(existsSync(statusRoutePath), "Status runtime precisa existir em src/app/api/runtime/route.ts");

const config = readFileSync(configPath, "utf8");
const providerConfig = readFileSync(providerConfigPath, "utf8");
const route = readFileSync(statusRoutePath, "utf8");
const gateway = readFileSync(join(root, "src/lib/llm-gateway.ts"), "utf8");

for (const text of [
  "readSecretEnv",
  "${name}_FILE",
]) {
  assert.ok(config.includes(text), `Runtime config sem contrato obrigatório: ${text}`);
}

for (const text of [
  "OPENAI_COMPATIBLE_API_KEY_FILE",
  "getLlmRuntimeStatus",
  "getActiveLlmProviderConfig",
  "lLMProviderConfig",
  "configSource",
  "configured",
  "maskedBaseUrl",
]) {
  assert.ok(providerConfig.includes(text), `Provider config sem contrato obrigatório: ${text}`);
}

assert.ok(gateway.includes("readSecretEnv"), "LLM Gateway deve ler API key via env ou Docker secret file");
assert.ok(route.includes("getLlmRuntimeStatus"), "GET /api/runtime deve retornar status do provider salvo no banco");
assert.ok(route.includes("database"), "GET /api/runtime deve incluir status sanitizado do banco");
assert.ok(!route.includes("OPENAI_COMPATIBLE_API_KEY,"), "Status runtime não pode expor segredo bruto");

console.log("Runtime config contract OK: secret-file support e status sanitizado existem.");
