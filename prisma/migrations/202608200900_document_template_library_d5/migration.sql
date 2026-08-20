-- D.5 — Document Template Library
-- Extends the existing production DocumentTemplate table without changing existing rows.

ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'FR';
ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "variables" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "isReference" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

CREATE INDEX IF NOT EXISTS "DocumentTemplate_category_idx" ON "DocumentTemplate"("category");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_type_idx" ON "DocumentTemplate"("type");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_isActive_idx" ON "DocumentTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_isReference_idx" ON "DocumentTemplate"("isReference");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTemplate_sourceRef_key" ON "DocumentTemplate"("sourceRef");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='DocumentTemplate_createdById_fkey') THEN
    ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
