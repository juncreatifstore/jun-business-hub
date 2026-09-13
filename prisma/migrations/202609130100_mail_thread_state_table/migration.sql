-- MailThreadState: read/star/archive/trash/snooze/workflow per mail thread,
-- moved out of the AppSetting key-value store into a real table.
CREATE TABLE IF NOT EXISTS "MailThreadState" (
  "threadId"       TEXT PRIMARY KEY REFERENCES "MailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "isRead"         BOOLEAN NOT NULL DEFAULT false,
  "starred"        BOOLEAN NOT NULL DEFAULT false,
  "archived"       BOOLEAN NOT NULL DEFAULT false,
  "trashed"        BOOLEAN NOT NULL DEFAULT false,
  "snoozedUntil"   TIMESTAMP(3),
  "workflowStatus" TEXT NOT NULL DEFAULT 'OPEN',
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById"    TEXT
);
CREATE INDEX IF NOT EXISTS "MailThreadState_workflowStatus_idx" ON "MailThreadState"("workflowStatus");
CREATE INDEX IF NOT EXISTS "MailThreadState_flags_idx" ON "MailThreadState"("archived", "trashed", "isRead");
CREATE INDEX IF NOT EXISTS "MailThreadState_snoozedUntil_idx" ON "MailThreadState"("snoozedUntil");

-- Copy existing states from AppSetting (only for threads that still exist).
INSERT INTO "MailThreadState" ("threadId","isRead","starred","archived","trashed","snoozedUntil","workflowStatus","updatedAt","updatedById")
SELECT
  substr(a.key, length('mail.thread.state.') + 1),
  COALESCE((a.value::jsonb->>'isRead')::boolean, false),
  COALESCE((a.value::jsonb->>'starred')::boolean, false),
  COALESCE((a.value::jsonb->>'archived')::boolean, false),
  COALESCE((a.value::jsonb->>'trashed')::boolean, false),
  NULLIF(a.value::jsonb->>'snoozedUntil','')::timestamp,
  COALESCE(NULLIF(a.value::jsonb->>'workflowStatus',''), 'OPEN'),
  COALESCE(NULLIF(a.value::jsonb->>'updatedAt','')::timestamp, CURRENT_TIMESTAMP),
  NULLIF(a.value::jsonb->>'updatedById','')
FROM "AppSetting" a
JOIN "MailThread" t ON t.id = substr(a.key, length('mail.thread.state.') + 1)
WHERE a.key LIKE 'mail.thread.state.%'
ON CONFLICT ("threadId") DO NOTHING;

-- Old rows are no longer read; drop them.
DELETE FROM "AppSetting" WHERE key LIKE 'mail.thread.state.%';
