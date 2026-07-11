CREATE TYPE "SocialConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE "PublicationStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrn" TEXT NOT NULL,
    "displayName" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "encryptedToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "SocialConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiryNoticeSentAt" TIMESTAMP(3),
    "connectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "artifactId" TEXT,
    "platform" TEXT NOT NULL,
    "authorUrn" TEXT NOT NULL,
    "commentary" TEXT NOT NULL,
    "mediaImageUrns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
    "externalPostUrn" TEXT,
    "externalUrl" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialConnection_tenantId_platform_key" ON "SocialConnection"("tenantId", "platform");
CREATE INDEX "SocialConnection_status_tokenExpiresAt_idx" ON "SocialConnection"("status", "tokenExpiresAt");
CREATE INDEX "Publication_status_scheduledFor_idx" ON "Publication"("status", "scheduledFor");
CREATE INDEX "Publication_tenantId_createdAt_idx" ON "Publication"("tenantId", "createdAt");

ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
