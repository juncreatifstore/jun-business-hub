-- RefundClaim processing: assignment + SLA, information requests, structured decision.
ALTER TABLE "RefundClaim" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundClaim" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "RefundClaim" ADD COLUMN IF NOT EXISTS "slaAlertedAt" TIMESTAMP(3);
ALTER TABLE "RefundClaim" ADD COLUMN IF NOT EXISTS "infoRequest" JSONB;
ALTER TABLE "RefundClaim" ADD COLUMN IF NOT EXISTS "decision" JSONB;
CREATE INDEX IF NOT EXISTS "RefundClaim_assignedToId_idx" ON "RefundClaim"("assignedToId");
