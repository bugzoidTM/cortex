import { prisma } from "./prisma";
import { sendTransactionalEmail } from "./email";

// Agente CEO: relatório diário por e-mail com a visão de dono do Cortex — contas,
// geração, publicações, conexões e falhas das últimas 24h, com recomendações simples
// baseadas em regras. Roda no loop do worker; a idempotência usa o EmailMessage do
// próprio dia (sem tabela nova), então sobrevive a restarts.

const REPORT_HOUR_UTC = 10; // ~07:00 America/Bahia (UTC-3)
const DAY_MS = 24 * 60 * 60 * 1000;

function reportSubject(now: Date) {
  return `Cortex — relatório diário do CEO · ${now.toISOString().slice(0, 10)}`;
}

export async function runCeoReportCycle(now = new Date()) {
  const to = process.env.CORTEX_CEO_REPORT_EMAIL ?? process.env.CORTEX_ALERT_EMAIL;
  if (!to) return { sent: false, reason: "sem_destinatario" };
  if (now.getUTCHours() < REPORT_HOUR_UTC) return { sent: false, reason: "cedo" };

  const subject = reportSubject(now);
  const already = await prisma.emailMessage.findFirst({ where: { subject, to }, select: { id: true } });
  if (already) return { sent: false, reason: "ja_enviado_hoje" };

  const since = new Date(now.getTime() - DAY_MS);
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const expiring = new Date(now.getTime() + 7 * DAY_MS);

  const [
    tenantsTotal,
    tenantsNew,
    tenantsByPlan,
    subsByStatus,
    jobs24h,
    usage24h,
    pubs24h,
    pubsScheduled,
    pubsFailedPending,
    connections,
    connsExpiring,
    media24h,
    newTenants7d,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { createdAt: { gte: since } } }),
    prisma.tenant.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.skillJob.groupBy({ by: ["status"], _count: { _all: true }, where: { createdAt: { gte: since } } }),
    prisma.lLMUsageLedger.aggregate({ where: { createdAt: { gte: since } }, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.publication.groupBy({ by: ["platform", "status"], _count: { _all: true }, where: { createdAt: { gte: since } } }),
    prisma.publication.count({ where: { status: "PENDING", scheduledFor: { gt: now } } }),
    prisma.publication.findMany({ where: { status: "FAILED", createdAt: { gte: since } }, select: { platform: true, error: true }, take: 5 }),
    prisma.socialConnection.groupBy({ by: ["platform", "status"], _count: { _all: true } }),
    prisma.socialConnection.count({ where: { status: "ACTIVE", tokenExpiresAt: { lte: expiring } } }),
    prisma.mediaAsset.count({ where: { createdAt: { gte: since } } }),
    prisma.tenant.count({ where: { createdAt: { gte: week } } }),
  ]);

  const fmtGroup = (rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, keys: string[]) =>
    rows.length ? rows.map((r) => `${keys.map((k) => r[k]).join("/")}: ${r._count._all}`).join(" · ") : "nenhum";

  const jobsFailed = jobs24h.find((j) => j.status === "FAILED")?._count._all ?? 0;
  const pubsFailed = pubs24h.filter((p) => p.status === "FAILED").reduce((a, p) => a + p._count._all, 0);

  const recomendacoes: string[] = [];
  if (pubsFailed > 0) recomendacoes.push(`- ${pubsFailed} publicação(ões) falharam nas últimas 24h — ver seção Publicar do painel e os erros acima.`);
  if (jobsFailed > 0) recomendacoes.push(`- ${jobsFailed} geração(ões) falharam — conferir chave/limites do LLM.`);
  if (connsExpiring > 0) recomendacoes.push(`- ${connsExpiring} conexão(ões) social(is) expira(m) em ≤7 dias — os avisos automáticos de reconexão já saem por e-mail.`);
  if (newTenants7d === 0) recomendacoes.push("- Nenhuma conta nova em 7 dias — vale um empurrão de divulgação/venda.");
  if (!recomendacoes.length) recomendacoes.push("- Tudo saudável. Nenhuma ação urgente.");

  const text = [
    `Relatório diário do Cortex — ${now.toISOString().slice(0, 10)}`,
    "",
    "CONTAS",
    `- Total: ${tenantsTotal} (novas 24h: ${tenantsNew}; novas 7d: ${newTenants7d})`,
    `- Por plano: ${fmtGroup(tenantsByPlan, ["plan"])}`,
    `- Assinaturas: ${fmtGroup(subsByStatus, ["status"])}`,
    "",
    "GERAÇÃO (24h)",
    `- Jobs: ${fmtGroup(jobs24h, ["status"])}`,
    `- Tokens: entrada ${usage24h._sum.inputTokens ?? 0} · saída ${usage24h._sum.outputTokens ?? 0}`,
    "",
    "PUBLICAÇÕES (24h)",
    `- Por rede/status: ${fmtGroup(pubs24h, ["platform", "status"])}`,
    `- Agendadas na fila: ${pubsScheduled}`,
    pubsFailedPending.length ? `- Falhas recentes: ${pubsFailedPending.map((p) => `${p.platform}: ${p.error ?? "?"}`).join(" | ").slice(0, 300)}` : "- Sem falhas recentes.",
    "",
    "REDES CONECTADAS",
    `- ${fmtGroup(connections, ["platform", "status"])}`,
    `- Expirando em ≤7d: ${connsExpiring}`,
    `- Imagens hospedadas 24h (anexadas/IA): ${media24h}`,
    "",
    "RECOMENDAÇÕES",
    ...recomendacoes,
    "",
    "Painel: https://cortex.nutef.com/painel · Admin: https://cortex.nutef.com/admin",
  ].join("\n");

  await sendTransactionalEmail({ to, subject, text });
  return { sent: true };
}
