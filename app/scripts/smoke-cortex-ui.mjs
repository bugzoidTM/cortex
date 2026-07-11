import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const authCard = readFileSync(join(process.cwd(), "src/app/components/auth-card.tsx"), "utf8");
const checkoutComponent = readFileSync(join(process.cwd(), "src/app/components/self-service-checkout.tsx"), "utf8");
const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
const publicCopy = `${page}\n${authCard}\n${checkoutComponent}\n${layout}`;

const requiredTexts = [
  "O que o Cortex faz",
  "Como funciona",
  "Planos e acesso",
  "Entrar no Cortex",
  "Começar teste grátis de 14 dias",
  "Testar 14 dias grátis",
  "Pacote de conteúdo com IA",
  "Voz da marca",
  "Controle de consumo",
  "Para equipes que precisam publicar com consistência",
  "Self-service com Pix",
  "Criar conta e pagar com Pix",
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
