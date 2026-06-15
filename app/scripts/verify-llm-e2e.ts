/**
 * Verificação ponta a ponta do LLM real.
 *
 * Cria um job de conteúdo e processa pela mesma cadeia do worker.
 * FALHA (exit 1) se cair no fallback determinístico (provider=internal-mvp)
 * ou se o job não concluir — garantindo que o provider real está respondendo.
 *
 * Rodar dentro do container web/worker (onde DATABASE_URL e as variáveis
 * OPENAI_COMPATIBLE_* estão definidas):
 *
 *   npm run verify:llm-e2e
 */
import { prisma } from "../src/lib/prisma";
import { createContentPackageJob, ensureDemoTenant } from "../src/lib/cortex-mvp";

async function main() {
  const tenant = await ensureDemoTenant();

  const result = await createContentPackageJob(
    {
      title: "Verificação E2E do LLM",
      objective: "Confirmar que a geração real está concluindo em produção",
      primaryPlatform: "LinkedIn",
      context: "Teste operacional do Cortex para validar o provider de IA configurado.",
      skill: "pacote-conteudo",
    },
    tenant.id,
  );

  const ledger = result.ledger;
  const report = {
    jobStatus: result.job.status,
    provider: ledger?.provider ?? null,
    model: ledger?.model ?? null,
    inputTokens: ledger?.inputTokens ?? 0,
    outputTokens: ledger?.outputTokens ?? 0,
    costUsd: ledger?.costUsd?.toString() ?? "0",
    ledgerStatus: ledger?.status ?? null,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!ledger || report.provider === "internal-mvp" || report.ledgerStatus === "fallback") {
    console.error("FALHA: caiu no fallback determinístico — o LLM real NÃO respondeu.");
    console.error("Verifique OPENAI_COMPATIBLE_API_KEY(_FILE), _BASE_URL, _MODEL e a conectividade.");
    process.exitCode = 1;
    return;
  }

  if (report.jobStatus !== "COMPLETED") {
    console.error(`FALHA: job terminou como ${report.jobStatus}.`);
    process.exitCode = 1;
    return;
  }

  if (report.costUsd === "0") {
    console.warn("AVISO: custo gravado = 0. Defina OPENAI_COMPATIBLE_INPUT_COST_PER_1M e _OUTPUT_COST_PER_1M para proteger a margem.");
  }

  console.log(`OK: geração real concluída via provider "${report.provider}" (modelo ${report.model}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
