import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const routePath = join(root, "src/app/api/brand-profile/route.ts");
const componentPath = join(root, "src/app/painel/dashboard.tsx");

assert.ok(existsSync(routePath), "Rota /api/brand-profile precisa existir");
const route = readFileSync(routePath, "utf8");
for (const text of ["requireCurrentSession", "GET", "PUT", "tenantId", "tone", "audience", "promise", "restrictions", "sampleContent"]) {
  assert.ok(route.includes(text), `Rota brand-profile sem contrato obrigatório: ${text}`);
}

const component = readFileSync(componentPath, "utf8");
for (const text of ["Voz da marca", "/api/brand-profile", "Tom", "Público", "Promessa", "Restrições", "Salvar voz da marca"]) {
  assert.ok(component.includes(text), `UI sem controle real de brand profile: ${text}`);
}

console.log("Brand profile contract OK: API protegida e UI editável existem.");
