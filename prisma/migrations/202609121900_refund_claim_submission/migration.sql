-- RefundClaim.submission: structured client submission (identity, payment
-- proof, service, evidence, declaration) with file roles.
ALTER TABLE "RefundClaim" ADD COLUMN IF NOT EXISTS "submission" JSONB NOT NULL DEFAULT '{}';
