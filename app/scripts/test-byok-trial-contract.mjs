import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { join } from "node:path";

const root = process.cwd();
const schemaPath = join(root, "prisma/schema.prisma");
const gatewayPath = join(root, "src/lib/llm-gateway.ts");
const credentialLibPath = join(root, "src/lib/tenant-llm-credential.ts");
const credentialRoutePath = join(root, "src/app/api/llm-credential/route.ts");
const uiPath = join(root, "src/app/painel/dashboard.tsx");
const adminPath = join(root, "src/lib/admin.ts");
const pagePath = join(root, "src/app/page.tsx");
const packagePath = join(root, "package.json");
const docsPath = join(root, "docs/llm-paid-plans.md");

for (const [path, message] of [
  [schemaPath, "schema Prisma precisa existir"],
  [gatewayPath, "gateway LLM precisa existir"],
  [credentialLibPath, "lib de credencial BYOK precisa existir"],
  [credentialRoutePath, "rota /api/llm-credential precisa existir"],
  [uiPath, "painel do cliente precisa existir"],
  [adminPath, "admin precisa existir"],
  [pagePath, "homepage precisa existir"],
  [docsPath, "documentação dos planos pagos precisa existir"],
]) {
  assert.ok(existsSync(path), message);
}

const schema = readFileSync(schemaPath, "utf8");
assert.match(schema, /model TenantLlmCredential/, "schema deve ter TenantLlmCredential");
assert.match(schema, /encryptedApiKey\s+String/, "credencial deve armazenar chave criptografada");
assert.match(schema, /apiKeyPreview\s+String/, "credencial deve guardar apenas preview seguro da chave");
assert.match(schema, /trialEndsAt\s+DateTime/, "credencial deve guardar fim do teste de 14 dias");
assert.match(schema, /@@unique\(\[tenantId\]\)/, "credencial deve ser única por tenant");

const credentialLib = readFileSync(credentialLibPath, "utf8");
for (const text of [
  "CORTEX_BYOK_ENCRYPTION_SECRET",
  "createCipheriv",
  "createDecipheriv",
  "TRIAL_DAYS = 14",
  "getActiveTenantLlmCredential",
  "upsertTenantLlmCredential",
  "deleteTenantLlmCredential",
]) {
  assert.ok(credentialLib.includes(text), `lib BYOK deve conter ${text}`);
}

const route = readFileSync(credentialRoutePath, "utf8");
for (const text of ["requireCurrentSession", "GET", "PUT", "DELETE", "apiKeyPreview", "trialEndsAt", "auth_required"]) {
  assert.ok(route.includes(text), `rota BYOK deve conter ${text}`);
}
assert.ok(!route.includes("encryptedApiKey"), "rota pública não deve vazar encryptedApiKey");

const gateway = readFileSync(gatewayPath, "utf8");
for (const text of ["getActiveTenantLlmCredential", "credential?.apiKey", "credential?.baseUrl", "credential?.trialActive", "byokTrial"]) {
  assert.ok(gateway.includes(text), `gateway deve preferir BYOK trial ativo: ${text}`);
}

const ui = readFileSync(uiPath, "utf8");
for (const text of ["/api/llm-credential", "teste de 14 dias", "Sua chave de API", "apiKeyPreview", "trialEndsAt"]) {
  assert.ok(ui.includes(text), `painel deve expor configuração BYOK: ${text}`);
}

const admin = readFileSync(adminPath, "utf8");
assert.ok(admin.includes("Trial self-service BYOK 14 dias"), "readiness/admin deve citar trial self-service BYOK 14 dias");
assert.ok(admin.includes("Checkout e billing"), "readiness deve manter billing como item operacional");

const page = readFileSync(pagePath, "utf8");
for (const text of ["Teste de 14 dias", "use sua própria chave API", "planos pagos", "gerenciado pela Nutef"]) {
  assert.ok(page.includes(text), `homepage deve explicar trial e planos pagos: ${text}`);
}

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
assert.equal(pkg.scripts["test:byok-trial"], "node scripts/test-byok-trial-contract.mjs", "package precisa expor test:byok-trial");

const docs = readFileSync(docsPath, "utf8");
for (const text of ["CORTEX_BYOK_ENCRYPTION_SECRET", "OPENAI_COMPATIBLE_API_KEY_FILE", "LLMProviderConfig", "closeai", "docker secret", "Plano pago"]) {
  assert.ok(docs.includes(text), `docs deve conter instrução: ${text}`);
}

console.log("Contrato BYOK trial + planos pagos OK");
