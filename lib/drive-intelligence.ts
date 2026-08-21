import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export const DRIVE_INTEL_PREFIX = "drive.intelligence.";
export const DRIVE_HASH_PREFIX = "drive.hash.";
export const DRIVE_TAGS_PREFIX = "drive.tags.";
export const DRIVE_DUPLICATE_PREFIX = "drive.duplicate.";

export type DriveStructuredData = {
  transactionAmount?: number | null;
  totalAmount?: number | null;
  feeAmount?: number | null;
  currency?: string;
  transactionDate?: string;
  transactionReference?: string;
  senderName?: string;
  beneficiaryName?: string;
  senderBank?: string;
  beneficiaryBank?: string;
  accountNumber?: string;
  paymentMethod?: string;
  invoiceNumber?: string;
  documentNumber?: string;
  country?: string;
};

export type DriveIntelligence = {
  indexedAt: string;
  contentExcerpt: string;
  searchableText: string;
  summary?: string;
  detailedDescription?: string;
  documentPurpose?: string;
  visualDescription?: string;
  language?: string;
  suggestedCategory?: string;
  tags?: string[];
  people?: string[];
  organizations?: string[];
  importantDates?: string[];
  keyFacts?: string[];
  actionItems?: string[];
  risks?: string[];
  missingInformation?: string[];
  structuredData?: DriveStructuredData;
  aiAnalyzedAt?: string;
};

const TEXT_MIME = new Set(["text/plain", "text/csv", "text/markdown", "application/json", "application/xml", "text/xml"]);

export function sha256Buffer(buf: Buffer) { return createHash("sha256").update(buf).digest("hex"); }
export function extractIndexableText(buf: Buffer, mimeType: string) {
  if (!TEXT_MIME.has(mimeType) && !mimeType.startsWith("text/")) return "";
  try { return buf.toString("utf8").replace(/\u0000/g, " ").replace(/\s+/g, " ").trim().slice(0, 60_000); } catch { return ""; }
}

export async function indexDriveFile(fileId: string, suppliedBuffer?: Buffer) {
  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false }, include: { client: { select: { firstName: true, lastName: true, internalId: true } }, case: { select: { caseNumber: true, title: true } }, folder: { select: { name: true } } } });
  if (!file) return null;
  let buf = suppliedBuffer;
  if (!buf) { try { buf = await storage().download(file.storageKey); } catch { buf = undefined; } }
  const hash = buf ? sha256Buffer(buf) : "";
  const content = buf ? extractIndexableText(buf, file.mimeType) : "";
  const metadataText = [file.name, file.category, file.mimeType, file.folder?.name, file.client ? `${file.client.firstName} ${file.client.lastName} ${file.client.internalId}` : "", file.case ? `${file.case.caseNumber} ${file.case.title}` : ""].filter(Boolean).join(" ");
  const existing = await prisma.appSetting.findUnique({ where: { key: `${DRIVE_INTEL_PREFIX}${file.id}` }, select: { value: true } });
  let previous: Partial<DriveIntelligence> = {};
  try { previous = existing ? JSON.parse(existing.value) : {}; } catch {}
  const intelligence: DriveIntelligence = {
    indexedAt: new Date().toISOString(), contentExcerpt: content.slice(0, 5000), searchableText: `${metadataText} ${content}`.slice(0, 60_000),
    ...(previous.summary ? { summary: previous.summary } : {}), ...(previous.detailedDescription ? { detailedDescription: previous.detailedDescription } : {}), ...(previous.documentPurpose ? { documentPurpose: previous.documentPurpose } : {}), ...(previous.visualDescription ? { visualDescription: previous.visualDescription } : {}), ...(previous.language ? { language: previous.language } : {}), ...(previous.suggestedCategory ? { suggestedCategory: previous.suggestedCategory } : {}), ...(previous.tags ? { tags: previous.tags } : {}), ...(previous.people ? { people: previous.people } : {}), ...(previous.organizations ? { organizations: previous.organizations } : {}), ...(previous.importantDates ? { importantDates: previous.importantDates } : {}), ...(previous.keyFacts ? { keyFacts: previous.keyFacts } : {}), ...(previous.actionItems ? { actionItems: previous.actionItems } : {}), ...(previous.risks ? { risks: previous.risks } : {}), ...(previous.missingInformation ? { missingInformation: previous.missingInformation } : {}), ...(previous.structuredData ? { structuredData: previous.structuredData } : {}), ...(previous.aiAnalyzedAt ? { aiAnalyzedAt: previous.aiAnalyzedAt } : {}),
  };
  const ops = [prisma.appSetting.upsert({ where: { key: `${DRIVE_INTEL_PREFIX}${file.id}` }, update: { value: JSON.stringify(intelligence) }, create: { key: `${DRIVE_INTEL_PREFIX}${file.id}`, value: JSON.stringify(intelligence) } })];
  if (hash) ops.push(prisma.appSetting.upsert({ where: { key: `${DRIVE_HASH_PREFIX}${file.id}` }, update: { value: hash }, create: { key: `${DRIVE_HASH_PREFIX}${file.id}`, value: hash } }));
  await prisma.$transaction(ops);
  let duplicateOf: string | null = null;
  if (hash) {
    const duplicate = await prisma.appSetting.findFirst({ where: { key: { startsWith: DRIVE_HASH_PREFIX, not: `${DRIVE_HASH_PREFIX}${file.id}` }, value: hash }, select: { key: true } });
    duplicateOf = duplicate?.key.slice(DRIVE_HASH_PREFIX.length) ?? null;
    const duplicateKey = `${DRIVE_DUPLICATE_PREFIX}${file.id}`;
    if (duplicateOf) await prisma.appSetting.upsert({ where: { key: duplicateKey }, update: { value: duplicateOf }, create: { key: duplicateKey, value: duplicateOf } });
    else await prisma.appSetting.deleteMany({ where: { key: duplicateKey } });
  }
  return { intelligence, hash, duplicateOf };
}

export async function getDriveIntelligence(fileId: string) {
  const [intel, tags, duplicate] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: `${DRIVE_INTEL_PREFIX}${fileId}` }, select: { value: true } }),
    prisma.appSetting.findUnique({ where: { key: `${DRIVE_TAGS_PREFIX}${fileId}` }, select: { value: true } }),
    prisma.appSetting.findUnique({ where: { key: `${DRIVE_DUPLICATE_PREFIX}${fileId}` }, select: { value: true } }),
  ]);
  let parsed: DriveIntelligence | null = null; try { parsed = intel ? JSON.parse(intel.value) : null; } catch {}
  let manualTags: string[] = []; try { manualTags = tags ? JSON.parse(tags.value) : []; } catch {}
  return { intelligence: parsed, manualTags, duplicateOf: duplicate?.value ?? null };
}
