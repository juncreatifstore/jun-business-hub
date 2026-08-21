-- Production drift repair: Payment uses recordedById in the current Prisma schema.
-- The legacy createdById column remained NOT NULL in production and blocked all inserts.
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_createdById_fkey";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "createdById";
