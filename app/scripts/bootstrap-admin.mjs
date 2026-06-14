import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  const email = process.env.CORTEX_BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.CORTEX_BOOTSTRAP_ADMIN_PASSWORD;
  const tenantSlug = process.env.CORTEX_BOOTSTRAP_TENANT_SLUG ?? "nutef";
  const tenantName = process.env.CORTEX_BOOTSTRAP_TENANT_NAME ?? "Nutef";

  if (!email || !password) {
    throw new Error("CORTEX_BOOTSTRAP_ADMIN_EMAIL e CORTEX_BOOTSTRAP_ADMIN_PASSWORD são obrigatórios");
  }

  if (password.length < 12) {
    throw new Error("CORTEX_BOOTSTRAP_ADMIN_PASSWORD precisa ter pelo menos 12 caracteres");
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName },
    create: {
      slug: tenantSlug,
      name: tenantName,
      plan: "beta",
      monthlyQuota: 1_000_000,
      brandProfile: {
        create: {
          tone: "formal, técnico, humano, objetivo",
          audience: "empreendedores e equipes que precisam transformar ideias em conteúdo útil",
          promise: "gerar pacotes de conteúdo em PT-BR no tom da marca com aprovação humana",
          restrictions: ["sem jargão de guru", "sem promessas irreais", "sempre manter humano no circuito"],
          sampleContent: "Demonstrações práticas, linguagem clara e foco em resultado operacional.",
        },
      },
    },
  });

  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      name: "Admin Nutef",
      passwordHash: hashPassword(password),
    },
  });

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: "owner" },
    create: { tenantId: tenant.id, userId: user.id, role: "owner" },
  });

  console.log(JSON.stringify({ ok: true, email: user.email, tenantSlug, tenantId: tenant.id }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
