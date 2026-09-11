-- MailThread: a Gmail thread id is only unique *within* a mailbox. The same
-- thread can be synced by several connected accounts (Workspace aliases share
-- one mailbox), so the global unique constraint caused
-- "Unique constraint failed on the fields: (gmailThreadId)" during sync.
-- Idempotent: already applied by hand on production on 2026-09-11.
ALTER TABLE "MailThread" DROP CONSTRAINT IF EXISTS "MailThread_gmailThreadId_key";
DROP INDEX IF EXISTS "MailThread_gmailThreadId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MailThread_mailAccountId_gmailThreadId_key"
  ON "MailThread"("mailAccountId", "gmailThreadId");
