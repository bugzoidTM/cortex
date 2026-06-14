import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const files = {
  auth: "src/lib/auth.ts",
  adminLib: "src/lib/admin.ts",
  adminApi: "src/app/api/admin/route.ts",
  adminPage: "src/app/admin/page.tsx",
  adminPanel: "src/app/admin/admin-panel.tsx",
};

assert.equal(packageJson.scripts?.["test:admin-panel"], "node scripts/test-admin-panel-contract.mjs", "package.json precisa expor npm run test:admin-panel");

for (const [name, rel] of Object.entries(files)) {
  assert.ok(existsSync(join(root, rel)), `Arquivo ausente para admin ${name}: ${rel}`);
}

const auth = readFileSync(join(root, files.auth), "utf8");
assert.match(auth, /requireSuperuserSession/, "auth.ts deve exportar requireSuperuserSession");
assert.match(auth, /CORTEX_SUPERUSER_EMAILS/, "superuser deve ser controlado por CORTEX_SUPERUSER_EMAILS");
assert.match(auth, /superuser_required/, "falha de superuser deve ser explícita");

const adminLib = readFileSync(join(root, files.adminLib), "utf8");
for (const symbol of ["getAdminDashboard", "createAdminTenant", "updateAdminTenant", "createAdminUser", "PRODUCTION_READINESS_ITEMS"]) {
  assert.match(adminLib, new RegExp(`\\b${symbol}\\b`), `src/lib/admin.ts precisa conter ${symbol}`);
}
assert.match(adminLib, /tenantCount/, "dashboard admin deve agregar tenants");
assert.match(adminLib, /totalCostUsd/, "dashboard admin deve agregar custo LLM");
assert.match(adminLib, /Jobs assíncronos/, "readiness deve listar jobs assíncronos como lacuna de produção");
assert.match(adminLib, /Backup/, "readiness deve listar backup/restore como lacuna de produção");
assert.match(adminLib, /Checkout/, "readiness deve listar checkout/billing como lacuna de produção");

const api = readFileSync(join(root, files.adminApi), "utf8");
assert.match(api, /requireSuperuserSession/, "API admin precisa exigir superuser");
assert.match(api, /superuser_required/, "API admin precisa retornar superuser_required");
assert.match(api, /create_tenant/, "API admin precisa suportar create_tenant");
assert.match(api, /update_tenant/, "API admin precisa suportar update_tenant");
assert.match(api, /create_user/, "API admin precisa suportar create_user");

const page = readFileSync(join(root, files.adminPage), "utf8");
assert.match(page, /Painel administrativo Cortex/, "página admin deve ter título claro");
assert.match(page, /AdminPanel/, "página admin deve renderizar AdminPanel");

const panel = readFileSync(join(root, files.adminPanel), "utf8");
for (const text of ["Superusuário", "Criar tenant", "Criar usuário", "Modo de produção", "Quota mensal", "/api/admin"]) {
  assert.match(panel, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `AdminPanel deve conter ${text}`);
}

console.log("Admin panel contract OK: superuser, API, UI e checklist de produção existem.");
