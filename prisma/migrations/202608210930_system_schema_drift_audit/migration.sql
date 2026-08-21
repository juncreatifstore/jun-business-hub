-- System-wide schema drift cleanup for legacy finance columns.
-- These columns belonged to earlier production shapes but are absent from the
-- current Prisma schema. Keeping them NOT NULL causes Prisma create() calls to
-- fail even when all current-model fields are valid.

ALTER TABLE "Payment" DROP COLUMN IF EXISTS "createdById";
ALTER TABLE "Refund" DROP COLUMN IF EXISTS "reference";
