import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const componentPath = join(root, "src/app/components/cortex-job-console.tsx");
assert.ok(existsSync(componentPath), "Console interativo de jobs precisa existir em src/app/components/cortex-job-console.tsx");

const source = readFileSync(componentPath, "utf8");
const requiredTexts = [
  "use client",
  "Criar pacote real",
  "Tema do pacote",
  "Objetivo",
  "Plataforma prioritária",
  "Contexto estratégico",
  "Jobs recentes",
  "Artifact gerado",
  "/api/jobs",
];

for (const text of requiredTexts) {
  assert.ok(source.includes(text), `Console de jobs sem texto/comportamento obrigatório: ${text}`);
}

const page = readFileSync(join(root, "src/app/page.tsx"), "utf8");
assert.ok(page.includes("CortexJobConsole"), "A home precisa renderizar o console interativo de jobs");

console.log(`Interactive jobs UI OK: ${requiredTexts.length} contratos encontrados.`);
