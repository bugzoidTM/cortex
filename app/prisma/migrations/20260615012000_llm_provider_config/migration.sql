-- Move modelo/preço/timeout para configuração persistente de superadmin.
CREATE TABLE "LLMProviderConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputCostPer1M" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "outputCostPer1M" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 1800,
    "timeoutMs" INTEGER NOT NULL DEFAULT 180000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMProviderConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LLMUsageLedger"
    ADD COLUMN "llmProviderConfigId" TEXT,
    ADD COLUMN "inputCostPer1M" DECIMAL(10,4) NOT NULL DEFAULT 0,
    ADD COLUMN "outputCostPer1M" DECIMAL(10,4) NOT NULL DEFAULT 0;

CREATE INDEX "LLMProviderConfig_enabled_isDefault_idx" ON "LLMProviderConfig"("enabled", "isDefault");
CREATE INDEX "LLMProviderConfig_tenantId_enabled_isDefault_idx" ON "LLMProviderConfig"("tenantId", "enabled", "isDefault");
CREATE INDEX "LLMUsageLedger_llmProviderConfigId_idx" ON "LLMUsageLedger"("llmProviderConfigId");

ALTER TABLE "LLMProviderConfig"
    ADD CONSTRAINT "LLMProviderConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LLMUsageLedger"
    ADD CONSTRAINT "LLMUsageLedger_llmProviderConfigId_fkey" FOREIGN KEY ("llmProviderConfigId") REFERENCES "LLMProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "LLMProviderConfig" (
    "id",
    "name",
    "provider",
    "baseUrl",
    "model",
    "inputCostPer1M",
    "outputCostPer1M",
    "maxOutputTokens",
    "timeoutMs",
    "enabled",
    "isDefault",
    "updatedAt"
) VALUES (
    'default-closeai-qwen37-max',
    'CloseAI Qwen 3.7 Max',
    'closeai',
    'https://closeai.nutef.com/v1',
    'qwen3.7-max',
    1.00,
    4.00,
    1800,
    180000,
    true,
    true,
    CURRENT_TIMESTAMP
);
