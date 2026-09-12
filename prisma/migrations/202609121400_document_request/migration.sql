-- DocumentRequest: secure upload link sent to a client to collect the pieces
-- missing on a case (or on the client file). Items are stored as JSON.
CREATE TABLE IF NOT EXISTS "DocumentRequest" (
  "id"            TEXT PRIMARY KEY,
  "token"         TEXT NOT NULL,
  "clientId"      TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "caseId"        TEXT REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "requestedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "items"         JSONB NOT NULL DEFAULT '[]',
  "message"       TEXT,
  "language"      TEXT NOT NULL DEFAULT 'fr',
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "sentVia"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "remindAt"      TIMESTAMP(3),
  "reminderCount" INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt"  TIMESTAMP(3),
  "completedAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentRequest_token_key" ON "DocumentRequest"("token");
CREATE INDEX IF NOT EXISTS "DocumentRequest_clientId_idx" ON "DocumentRequest"("clientId");
CREATE INDEX IF NOT EXISTS "DocumentRequest_caseId_idx" ON "DocumentRequest"("caseId");
CREATE INDEX IF NOT EXISTS "DocumentRequest_status_remindAt_idx" ON "DocumentRequest"("status", "remindAt");
