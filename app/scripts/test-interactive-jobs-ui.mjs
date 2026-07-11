import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
// O painel autenticado vive em /painel (dashboard com sidebar); a landing só faz o acesso.
const dashboardPath = join(root, "src/app/painel/dashboard.tsx");
const painelPagePath = join(root, "src/app/painel/page.tsx");
assert.ok(existsSync(dashboardPath), "Dashboard precisa existir em src/app/painel/dashboard.tsx");
assert.ok(existsSync(painelPagePath), "Rota /painel precisa existir em src/app/painel/page.tsx");

const source = readFileSync(dashboardPath, "utf8");
const requiredTexts = [
  "use client",
  "Criar conteúdo",
  "Publicar",
  "Voz da marca",
  "Conta",
  "Tema",
  "Objetivo",
  "Contexto",
  "Gerações recentes",
  "Pacote gerado",
  "Publicar no LinkedIn",
  "/api/jobs",
  "/api/publications",
];

for (const text of requiredTexts) {
  assert.ok(source.includes(text), `Dashboard sem texto/comportamento obrigatório: ${text}`);
}

// O painel protege por sessão (401 volta para a landing) e não usa jargão interno na UI visível.
assert.ok(source.includes("/api/auth/me"), "Dashboard deve checar a sessão em /api/auth/me");
assert.ok(source.includes("/#acesso"), "Dashboard deve redirecionar para a landing quando não autenticado");

const page = readFileSync(join(root, "src/app/page.tsx"), "utf8");
assert.ok(page.includes("AuthCard"), "A home precisa renderizar o card de acesso (AuthCard)");
assert.ok(!page.includes("CortexJobConsole"), "A home não deve mais embutir o console gigante");

console.log(`Interactive dashboard UI OK: ${requiredTexts.length} contratos encontrados.`);
