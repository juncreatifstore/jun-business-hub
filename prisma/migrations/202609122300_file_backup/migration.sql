-- File backup replication markers (Google Drive copy).
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "backupRef" TEXT;
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "backupAt" TIMESTAMP(3);
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "backupError" TEXT;
CREATE INDEX IF NOT EXISTS "File_backupAt_idx" ON "File"("backupAt");
