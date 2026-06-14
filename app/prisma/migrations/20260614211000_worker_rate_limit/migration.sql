-- Add worker bookkeeping to jobs
ALTER TABLE "SkillJob" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SkillJob" ADD COLUMN "lockedAt" TIMESTAMP(3);

-- Persistent rate-limit events for distributed web replicas
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitEvent_key_action_createdAt_idx" ON "RateLimitEvent"("key", "action", "createdAt");
