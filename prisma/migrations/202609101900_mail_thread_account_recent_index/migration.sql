-- Mail list: threads of a mailbox ordered by most recent message
CREATE INDEX IF NOT EXISTS "MailThread_mailAccountId_lastMessageAt_idx" ON "MailThread"("mailAccountId", "lastMessageAt" DESC);
