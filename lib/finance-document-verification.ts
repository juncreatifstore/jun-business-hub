import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const PREFIX = "finance.document.verify.";

export type FinanceDocumentVerificationRecord = {
  reference: string;
  type: string;
  status: string;
  issuedAt: string;
  verificationCode: string;
};

function cleanReference(reference: string) {
  return String(reference || "").trim().slice(0, 120);
}

function registryKey(reference: string) {
  const digest = createHash("sha256").update(cleanReference(reference)).digest("hex");
  return `${PREFIX}${digest}`;
}

function verificationCode(reference: string, type: string, issuedAt: string) {
  const digest = createHash("sha256").update(`${cleanReference(reference)}|${type}|${issuedAt}`).digest("hex").toUpperCase();
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}`;
}

export function buildFinanceDocumentVerificationUrl(reference: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.juncreatif.org").replace(/\/$/, "");
  return `${base}/verify/${encodeURIComponent(cleanReference(reference))}`;
}

export async function registerFinanceDocumentVerification(input: {
  reference: string;
  type: string;
  status?: string;
  issuedAt?: Date | string;
}) {
  const reference = cleanReference(input.reference);
  if (!reference) return null;
  const issuedAt = input.issuedAt instanceof Date ? input.issuedAt.toISOString() : String(input.issuedAt || new Date().toISOString());
  const record: FinanceDocumentVerificationRecord = {
    reference,
    type: String(input.type || "Financial document").trim().slice(0, 100),
    status: String(input.status || "ISSUED").trim().slice(0, 50),
    issuedAt,
    verificationCode: verificationCode(reference, String(input.type || "Financial document"), issuedAt),
  };
  const value = JSON.stringify(record);
  await prisma.appSetting.upsert({
    where: { key: registryKey(reference) },
    update: { value },
    create: { key: registryKey(reference), value },
  }).catch(() => null);
  return record;
}

export async function getFinanceDocumentVerification(reference: string): Promise<FinanceDocumentVerificationRecord | null> {
  const clean = cleanReference(reference);
  if (!clean) return null;
  const row = await prisma.appSetting.findUnique({ where: { key: registryKey(clean) }, select: { value: true } }).catch(() => null);
  if (!row?.value) return null;
  try {
    const record = JSON.parse(row.value) as FinanceDocumentVerificationRecord;
    if (!record || record.reference !== clean || !record.type || !record.issuedAt || !record.verificationCode) return null;
    return record;
  } catch {
    return null;
  }
}
