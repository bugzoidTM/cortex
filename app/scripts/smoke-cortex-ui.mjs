import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");

const requiredTexts = [
  "Mapa de navegação",
  "Onboarding guiado",
  "Central de jobs",
  "Fila de aprovação humana",
  "Ledger de consumo",
  "Admin Nutef",
  "Executar pacote agora",
  "Próximo sprint de produção",
];

for (const text of requiredTexts) {
  assert.ok(page.includes(text), `Texto obrigatório ausente no protótipo: ${text}`);
}

console.log(`Smoke UI OK: ${requiredTexts.length} blocos críticos encontrados.`);
