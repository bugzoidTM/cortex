-- Tenant-owned OpenAI-compatible key for a 14-day BYOK trial.
CREATE TABLE "TenantLlmCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "apiKeyPreview" TEXT NOT NULL,
    "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantLlmCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantLlmCredential_tenantId_key" ON "TenantLlmCredential"("tenantId");
CREATE INDEX "TenantLlmCredential_enabled_trialEndsAt_idx" ON "TenantLlmCredential"("enabled", "trialEndsAt");

ALTER TABLE "TenantLlmCredential"
    ADD CONSTRAINT "TenantLlmCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
