import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { join } from "node:path";

const root = process.cwd();
const files = {
  schema: join(root, "prisma/schema.prisma"),
  pkg: join(root, "package.json"),
  billing: join(root, "src/lib/billing.ts"),
  woovi: join(root, "src/lib/woovi.ts"),
  email: join(root, "src/lib/email.ts"),
  checkoutRoute: join(root, "src/app/api/checkout/route.ts"),
  webhookRoute: join(root, "src/app/api/webhooks/woovi/route.ts"),
  forgotRoute: join(root, "src/app/api/auth/forgot-password/route.ts"),
  resetRoute: join(root, "src/app/api/auth/reset-password/route.ts"),
  checkoutUi: join(root, "src/app/components/self-service-checkout.tsx"),
  jobsRoute: join(root, "src/app/api/jobs/route.ts"),
  runtime: join(root, "src/app/api/runtime/route.ts"),
  docs: join(root, "docs/woovi-self-service.md"),
  stack: join(root, "../deploy/cortex-stack.yml"),
};

for (const [name, path] of Object.entries(files)) {
  assert.ok(existsSync(path), `${name} precisa existir em ${path}`);
}

const schema = readFileSync(files.schema, "utf8");
for (const text of [
  "model Subscription",
  "model PaymentInvoice",
  "model PasswordResetToken",
  "model EmailMessage",
  "wooviCorrelationID",
  "paymentLinkUrl",
  "currentPeriodEnd",
  "pastDueSince",
  "SubscriptionStatus",
  "InvoiceStatus",
]) assert.ok(schema.includes(text), `schema precisa conter ${text}`);

const billing = readFileSync(files.billing, "utf8");
for (const text of [
  "SELF_SERVICE_PLANS",
  "createSelfServiceCheckout",
  "handleWooviChargeCompleted",
  "assertTenantBillingActive",
  "BillingBlockedError",
  "createWooviCharge",
  "sendTransactionalEmail",
]) assert.ok(billing.includes(text), `billing precisa conter ${text}`);

const woovi = readFileSync(files.woovi, "utf8");
for (const text of [
  "WOOVI_APP_ID",
  "WOOVI_API_BASE_URL",
  "Authorization",
  "/api/v1/charge",
  "correlationID",
  "paymentLinkUrl",
  "brCode",
]) assert.ok(woovi.includes(text), `woovi lib precisa conter ${text}`);
assert.ok(!woovi.includes("Bearer"), "Woovi Authorization não deve usar Bearer");

const email = readFileSync(files.email, "utf8");
for (const text of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EmailMessage", "sendTransactionalEmail", "nodemailer"]) {
  assert.ok(email.includes(text), `email lib precisa conter ${text}`);
}

const checkoutRoute = readFileSync(files.checkoutRoute, "utf8");
for (const text of ["POST", "createSelfServiceCheckout", "paymentLinkUrl", "checkout"])
  assert.ok(checkoutRoute.includes(text), `checkout route precisa conter ${text}`);

const webhookRoute = readFileSync(files.webhookRoute, "utf8");
for (const text of ["OPENPIX:CHARGE_COMPLETED", "CORTEX_WOOVI_WEBHOOK_SECRET", "handleWooviChargeCompleted", "correlationID"])
  assert.ok(webhookRoute.includes(text), `webhook route precisa conter ${text}`);

const forgotRoute = readFileSync(files.forgotRoute, "utf8");
const resetRoute = readFileSync(files.resetRoute, "utf8");
assert.ok(forgotRoute.includes("PasswordResetToken") && forgotRoute.includes("sendTransactionalEmail"), "forgot-password deve criar token e enviar email");
assert.ok(resetRoute.includes("hashPassword") && resetRoute.includes("tokenHash"), "reset-password deve validar token e atualizar senha");

const jobsRoute = readFileSync(files.jobsRoute, "utf8");
assert.ok(jobsRoute.includes("assertTenantBillingActive"), "jobs devem bloquear tenant inadimplente antes de criar job");
assert.ok(jobsRoute.includes("billing_blocked"), "jobs devem retornar erro billing_blocked");

const ui = readFileSync(files.checkoutUi, "utf8");
for (const text of ["/api/checkout", "Criar conta e pagar com Pix", "paymentLinkUrl", "Plano Starter", "Plano Pro", "Esqueci minha senha"])
  assert.ok(ui.includes(text), `UI checkout precisa conter ${text}`);

const runtime = readFileSync(files.runtime, "utf8");
assert.ok(runtime.includes("woovi") && runtime.includes("email"), "runtime deve expor status sanitizado de Woovi e email");

const docs = readFileSync(files.docs, "utf8");
for (const text of ["Api/Plugins", "AppID", "Authorization sem Bearer", "Novo Webhook", "OPENPIX:CHARGE_COMPLETED", "CORTEX_WOOVI_WEBHOOK_SECRET", "WOOVI_APP_ID_FILE"])
  assert.ok(docs.includes(text), `docs Woovi deve conter ${text}`);

const pkg = JSON.parse(readFileSync(files.pkg, "utf8"));
assert.equal(pkg.scripts["test:self-service-billing"], "node scripts/test-self-service-billing-contract.mjs");
assert.ok(pkg.dependencies.nodemailer, "nodemailer deve ser dependência");

console.log("Contrato self-service billing Woovi + e-mails OK");
