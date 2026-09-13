-- RefundClaim: refund request submitted by a client through a secure form link.
CREATE TABLE IF NOT EXISTS "RefundClaim" (
  "id"            TEXT PRIMARY KEY,
  "token"         TEXT NOT NULL,
  "clientId"      TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "caseId"        TEXT REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "paymentId"     TEXT REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "requestedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "language"      TEXT NOT NULL DEFAULT 'fr',
  "message"       TEXT,
  "status"        TEXT NOT NULL DEFAULT 'SENT',
  "sentVia"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "submittedAt"   TIMESTAMP(3),
  "amount"        DECIMAL(12,2),
  "currency"      TEXT,
  "reasonCode"    TEXT,
  "reason"        TEXT,
  "payoutMethod"  TEXT,
  "payoutDetails" JSONB NOT NULL DEFAULT '{}',
  "contactEmail"  TEXT,
  "contactPhone"  TEXT,
  "fileIds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "clientIp"      TEXT,
  "refundId"      TEXT REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "decisionNote"  TEXT,
  "decidedById"   TEXT,
  "decidedAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "RefundClaim_token_key" ON "RefundClaim"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "RefundClaim_refundId_key" ON "RefundClaim"("refundId");
CREATE INDEX IF NOT EXISTS "RefundClaim_clientId_idx" ON "RefundClaim"("clientId");
CREATE INDEX IF NOT EXISTS "RefundClaim_status_createdAt_idx" ON "RefundClaim"("status", "createdAt");
