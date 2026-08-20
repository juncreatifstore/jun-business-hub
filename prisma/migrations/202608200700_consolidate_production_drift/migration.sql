-- JUN Business Hub production-drift consolidation.
-- Intentionally idempotent: production received several emergency fixes directly
-- through Supabase while the application was being stabilized.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- MailAccount runtime alignment
ALTER TABLE "MailAccount" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "MailAccount" ADD COLUMN IF NOT EXISTS "accessTokenEnc" TEXT;
ALTER TABLE "MailAccount" ADD COLUMN IF NOT EXISTS "aiEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MailAccount" ALTER COLUMN "connectedById" DROP NOT NULL;

-- AppSetting current Prisma shape
ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "id" TEXT;
UPDATE "AppSetting" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "AppSetting" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "AppSetting" ALTER COLUMN "id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_id_key" ON "AppSetting"("id");

-- Gmail runtime thread model
DO $$ BEGIN
  CREATE TYPE "EmailAILevel" AS ENUM ('AUTO','APPROVAL_REQUIRED','BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "MailThread" (
  "id" TEXT PRIMARY KEY,
  "gmailThreadId" TEXT NOT NULL UNIQUE,
  "mailAccountId" TEXT NOT NULL,
  "clientId" TEXT,
  "subject" TEXT,
  "snippet" TEXT,
  "fromEmail" TEXT,
  "toEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastMessageAt" TIMESTAMP(3),
  "aiLevel" "EmailAILevel" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  "aiCategory" TEXT,
  "aiSummary" TEXT,
  "aiDraft" TEXT,
  "requiresAttention" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailThread_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailThread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MailThread_mailAccountId_idx" ON "MailThread"("mailAccountId");
CREATE INDEX IF NOT EXISTS "MailThread_clientId_idx" ON "MailThread"("clientId");
CREATE INDEX IF NOT EXISTS "MailThread_lastMessageAt_idx" ON "MailThread"("lastMessageAt");
ALTER TABLE "MailThread" ENABLE ROW LEVEL SECURITY;

-- SignatureRequest current shape
ALTER TABLE "SignatureRequest" ADD COLUMN IF NOT EXISTS "recipients" JSONB;
ALTER TABLE "SignatureRequest" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "SignatureRequest" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "SignatureRequest" ADD COLUMN IF NOT EXISTS "signedPdfHash" TEXT;
UPDATE "SignatureRequest" SET "recipients"='[]'::jsonb WHERE "recipients" IS NULL;
ALTER TABLE "SignatureRequest" ALTER COLUMN "recipients" SET DEFAULT '[]'::jsonb;
ALTER TABLE "SignatureRequest" ALTER COLUMN "recipients" SET NOT NULL;

-- Payment current shape
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerRef" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "recordedById" TEXT;
UPDATE "Payment" SET "recordedById"="createdById" WHERE "recordedById" IS NULL AND "createdById" IS NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "paidAt" DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Payment" WHERE "recordedById" IS NULL) THEN
    ALTER TABLE "Payment" ALTER COLUMN "recordedById" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Payment_recordedById_fkey') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Refund current shape
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "refundNumber" TEXT;
UPDATE "Refund" SET "refundNumber"="reference" WHERE "refundNumber" IS NULL AND "reference" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Refund_refundNumber_key" ON "Refund"("refundNumber");
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM "Refund" WHERE "refundNumber" IS NULL) THEN ALTER TABLE "Refund" ALTER COLUMN "refundNumber" SET NOT NULL; END IF; END $$;
ALTER TABLE "RefundInstallment" ADD COLUMN IF NOT EXISTS "number" INTEGER;
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "refundId" ORDER BY "dueDate", id)::int rn FROM "RefundInstallment"
) UPDATE "RefundInstallment" r SET "number"=ranked.rn FROM ranked WHERE r.id=ranked.id AND r."number" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "RefundInstallment_refundId_number_key" ON "RefundInstallment"("refundId","number");
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM "RefundInstallment" WHERE "number" IS NULL) THEN ALTER TABLE "RefundInstallment" ALTER COLUMN "number" SET NOT NULL; END IF; END $$;

-- AIAction current shape, while keeping legacy columns compatible
ALTER TABLE "AIAction" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "AIAction" ADD COLUMN IF NOT EXISTS "tool" TEXT;
ALTER TABLE "AIAction" ADD COLUMN IF NOT EXISTS "args" JSONB;
ALTER TABLE "AIAction" ADD COLUMN IF NOT EXISTS "result" JSONB;
ALTER TABLE "AIAction" ADD COLUMN IF NOT EXISTS "executedAt" TIMESTAMP(3);
UPDATE "AIAction" SET "userId"="proposedById" WHERE "userId" IS NULL AND "proposedById" IS NOT NULL;
UPDATE "AIAction" SET "tool"="type" WHERE "tool" IS NULL AND "type" IS NOT NULL;
UPDATE "AIAction" SET "args"="payload" WHERE "args" IS NULL AND "payload" IS NOT NULL;
ALTER TABLE "AIAction" ALTER COLUMN "type" DROP NOT NULL;
ALTER TABLE "AIAction" ALTER COLUMN "payload" DROP NOT NULL;
ALTER TABLE "AIAction" ALTER COLUMN "proposedById" DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "AIAction" WHERE "userId" IS NULL OR "tool" IS NULL OR "args" IS NULL) THEN
    ALTER TABLE "AIAction" ALTER COLUMN "userId" SET NOT NULL;
    ALTER TABLE "AIAction" ALTER COLUMN "tool" SET NOT NULL;
    ALTER TABLE "AIAction" ALTER COLUMN "args" SET NOT NULL;
  END IF;
END $$;
ALTER TABLE "AIConversation" ALTER COLUMN "title" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "AIAction_userId_idx" ON "AIAction"("userId");
CREATE INDEX IF NOT EXISTS "AIAction_status_idx" ON "AIAction"("status");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AIAction_userId_fkey') THEN
    ALTER TABLE "AIAction" ADD CONSTRAINT "AIAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Preserve application AI approval flow in database migrations.
CREATE OR REPLACE FUNCTION public.jun_ai_action_set_executed_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='EXECUTED'::"AIActionStatus" AND NEW."executedAt" IS NULL THEN NEW."executedAt":=CURRENT_TIMESTAMP; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_jun_ai_action_set_executed_at ON "AIAction";
CREATE TRIGGER trg_jun_ai_action_set_executed_at BEFORE UPDATE ON "AIAction" FOR EACH ROW EXECUTE FUNCTION public.jun_ai_action_set_executed_at();

-- Signature retention policy: configurable in AppSetting, default 7 years.
INSERT INTO "AppSetting" ("id","key","value","updatedAt")
SELECT gen_random_uuid()::text,'SIGNATURE_RETENTION_YEARS','7',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "AppSetting" WHERE "key"='SIGNATURE_RETENTION_YEARS');

CREATE OR REPLACE FUNCTION public.jun_signature_apply_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  years_to_keep integer := 7;
  retention_iso text;
BEGIN
  IF NEW."recipients" IS NULL OR jsonb_typeof(NEW."recipients") <> 'array' OR jsonb_array_length(NEW."recipients") = 0 THEN RETURN NEW; END IF;
  BEGIN
    SELECT GREATEST(1, LEAST(20, value::integer)) INTO years_to_keep FROM "AppSetting" WHERE "key"='SIGNATURE_RETENTION_YEARS' LIMIT 1;
  EXCEPTION WHEN others THEN years_to_keep := 7;
  END;
  years_to_keep := COALESCE(years_to_keep,7);
  IF COALESCE(NEW."recipients"->0->'_meta'->>'retentionUntil','') = ''
     AND NEW.status IN ('SENT'::"SignatureStatus",'VIEWED'::"SignatureStatus",'PARTIALLY_SIGNED'::"SignatureStatus",'SIGNED'::"SignatureStatus") THEN
    retention_iso := to_char(CURRENT_TIMESTAMP + make_interval(years => years_to_keep), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    NEW."recipients" := jsonb_set(NEW."recipients", '{0,_meta,retentionUntil}', to_jsonb(retention_iso), true);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_jun_signature_apply_retention ON "SignatureRequest";
CREATE TRIGGER trg_jun_signature_apply_retention BEFORE INSERT OR UPDATE ON "SignatureRequest" FOR EACH ROW EXECUTE FUNCTION public.jun_signature_apply_retention();

-- Backfill retention metadata for already active/completed signature requests.
UPDATE "SignatureRequest"
SET "recipients" = jsonb_set("recipients", '{0,_meta,retentionUntil}', to_jsonb(to_char(COALESCE("completedAt","sentAt","createdAt") + interval '7 years','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true)
WHERE jsonb_typeof("recipients")='array' AND jsonb_array_length("recipients")>0
  AND COALESCE("recipients"->0->'_meta'->>'retentionUntil','')=''
  AND status IN ('SENT','VIEWED','PARTIALLY_SIGNED','SIGNED');
