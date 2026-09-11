-- FileExtraction: structured data (document type + key fields) extracted by AI
-- from a Drive file. One row per file; expiresAt drives expiration alerts.
CREATE TABLE IF NOT EXISTS "FileExtraction" (
  "fileId"         TEXT PRIMARY KEY REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "docType"        TEXT NOT NULL DEFAULT 'OTHER',
  "confidence"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "holderName"     TEXT,
  "documentNumber" TEXT,
  "issuingCountry" TEXT,
  "issuer"         TEXT,
  "dateOfBirth"    TIMESTAMP(3),
  "issuedAt"       TIMESTAMP(3),
  "expiresAt"      TIMESTAMP(3),
  "amount"         DECIMAL(14,2),
  "currency"       TEXT,
  "reference"      TEXT,
  "fields"         JSONB NOT NULL DEFAULT '{}',
  "model"          TEXT,
  "extractedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error"          TEXT
);
CREATE INDEX IF NOT EXISTS "FileExtraction_docType_idx" ON "FileExtraction"("docType");
CREATE INDEX IF NOT EXISTS "FileExtraction_expiresAt_idx" ON "FileExtraction"("expiresAt");
