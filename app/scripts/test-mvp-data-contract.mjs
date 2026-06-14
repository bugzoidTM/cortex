import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const prismaPath = join(root, "prisma/schema.prisma");
const routes = [
  "src/app/api/health/route.ts",
  "src/app/api/mvp/route.ts",
  "src/app/api/jobs/route.ts",
];

assert.ok(existsSync(prismaPath), "prisma/schema.prisma precisa existir");
const schema = readFileSync(prismaPath, "utf8");
for (const model of ["Tenant", "BrandProfile", "Briefing", "SkillJob", "Artifact", "LLMUsageLedger"]) {
  assert.match(schema, new RegExp(`model\\s+${model}\\b`), `Modelo ${model} ausente no Prisma schema`);
}

for (const route of routes) {
  const fullPath = join(root, route);
  assert.ok(existsSync(fullPath), `Rota API ausente: ${route}`);
  const source = readFileSync(fullPath, "utf8");
  assert.match(source, /Response\.json/, `${route} deve responder JSON`);
}

console.log("MVP data contract OK: Prisma schema e rotas API mínimas existem.");
