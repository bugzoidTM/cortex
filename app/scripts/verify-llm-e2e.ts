/**
 * Verificação ponta a ponta do LLM real.
 *
 * Cria um job de conteúdo e aguarda o worker de produção processar.
 * FALHA (exit 1) se cair no fallback determinístico (provider=internal-mvp)
 * ou se o job não concluir — garantindo que o provider real está respondendo.
 *
 * Rodar dentro do container web/worker (onde DATABASE_URL e as variáveis
 * OPENAI_COMPATIBLE_* estão definidas):
 *
 *   npm run verify:llm-e2e
 */
import { prisma } from "../src/lib/prisma";
import { enqueueContentPackageJob, ensureDemoTenant } from "../src/lib/cortex-mvp";

const timeoutMs = Number(process.env.VERIFY_LLM_E2E_TIMEOUT_MS ?? "300000");
const pollIntervalMs = 2500;

async function main() {
  const tenant = await ensureDemoTenant();

  const result = await enqueueContentPackageJob(
    {
      title: "Verificação E2E do LLM",
      objective: "Confirmar que a geração real está concluindo em produção",
      primaryPlatform: "LinkedIn",
      context: "Teste operacional do Cortex para validar o provider de IA configurado.",
      skill: "pacote-conteudo",
    },
    tenant.id,
  );

  const processed = await waitForProcessedJob(result.job.id);
  const ledger = processed.usageLedger[0];
  const report = {
    jobStatus: processed.status,
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

async function waitForProcessedJob(jobId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const job = await prisma.skillJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { usageLedger: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (["COMPLETED", "FAILED"].includes(job.status) && job.usageLedger.length > 0) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`verify_llm_e2e_timeout_after_${timeoutMs}ms`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
