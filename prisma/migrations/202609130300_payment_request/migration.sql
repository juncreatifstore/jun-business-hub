-- PaymentRequest: ask a client to pay an amount through a secure link; offline
-- payments come back with a proof that staff confirm.
CREATE TABLE IF NOT EXISTS "PaymentRequest" (
  "id"            TEXT PRIMARY KEY,
  "token"         TEXT NOT NULL,
  "clientId"      TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "caseId"        TEXT REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "requestedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount"        DECIMAL(12,2) NOT NULL,
  "currency"      TEXT NOT NULL DEFAULT 'USD',
  "description"   TEXT NOT NULL,
  "language"      TEXT NOT NULL DEFAULT 'fr',
  "message"       TEXT,
  "allowedMethods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "onlineUrl"     TEXT,
  "dueAt"         TIMESTAMP(3),
  "status"        TEXT NOT NULL DEFAULT 'SENT',
  "sentVia"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "viewedAt"      TIMESTAMP(3),
  "proof"         JSONB,
  "paymentId"     TEXT REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "reminderCount" INTEGER NOT NULL DEFAULT 0,
  "remindAt"      TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentRequest_token_key" ON "PaymentRequest"("token");
CREATE INDEX IF NOT EXISTS "PaymentRequest_clientId_idx" ON "PaymentRequest"("clientId");
CREATE INDEX IF NOT EXISTS "PaymentRequest_status_dueAt_idx" ON "PaymentRequest"("status", "dueAt");
