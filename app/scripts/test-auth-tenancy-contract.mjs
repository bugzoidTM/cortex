import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const authLib = join(root, "src/lib/auth.ts");

for (const model of ["model User", "model TenantMembership", "model Session"]) {
  assert.ok(schema.includes(model), `Schema precisa conter ${model}`);
}

for (const relation of ["memberships  TenantMembership[]", "sessions     Session[]", "role      String", "passwordHash String"]) {
  assert.ok(schema.includes(relation), `Schema de auth/tenancy incompleto: ${relation}`);
}

assert.ok(existsSync(authLib), "Auth helper precisa existir em src/lib/auth.ts");
const auth = readFileSync(authLib, "utf8");
for (const text of [
  "hashPassword",
  "verifyPassword",
  "createSession",
  "getCurrentSession",
  "requireCurrentSession",
  "cortex_session",
  "tenantId",
]) {
  assert.ok(auth.includes(text), `Auth helper sem contrato obrigatório: ${text}`);
}

for (const route of [
  "src/app/api/auth/login/route.ts",
  "src/app/api/auth/logout/route.ts",
  "src/app/api/auth/me/route.ts",
]) {
  assert.ok(existsSync(join(root, route)), `Rota de auth ausente: ${route}`);
}

const jobsRoute = readFileSync(join(root, "src/app/api/jobs/route.ts"), "utf8");
assert.ok(jobsRoute.includes("requireCurrentSession"), "API de jobs precisa exigir sessão real");
assert.ok(jobsRoute.includes("tenantId"), "API de jobs precisa operar no tenant da sessão");

console.log("Auth + tenancy contract OK: schema, rotas, sessão e proteção de jobs existem.");
