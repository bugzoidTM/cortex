import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const consoleComponent = readFileSync(join(process.cwd(), "src/app/components/cortex-job-console.tsx"), "utf8");
const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
const publicCopy = `${page}\n${consoleComponent}\n${layout}`;

const requiredTexts = [
  "O que o Cortex faz",
  "Como funciona",
  "Planos e acesso",
  "Entrar no Cortex",
  "Solicitar acesso",
  "Pacote de conteúdo com IA",
  "Voz da marca",
  "Controle de consumo",
  "Para equipes que precisam publicar com consistência",
  "Acesso por convite",
  "Cortex — Plataforma de conteúdo com IA",
];

const forbiddenTexts = [
  "Ver protótipo",
  "protótipo",
  "prototipo",
  "próximo bloco",
  "mock navegável",
  "Sair do mock",
  "controle MVP",
  "Console MVP",
  "validar o MVP",
  "Próximo sprint de produção",
];

for (const text of requiredTexts) {
  assert.ok(publicCopy.includes(text), `Texto comercial obrigatório ausente: ${text}`);
}

for (const text of forbiddenTexts) {
  assert.ok(!publicCopy.toLowerCase().includes(text.toLowerCase()), `Texto de MVP/protótipo não deve aparecer na comunicação pública: ${text}`);
}

console.log(`Smoke UI OK: comunicação comercial validada com ${requiredTexts.length} blocos e ${forbiddenTexts.length} termos proibidos.`);
