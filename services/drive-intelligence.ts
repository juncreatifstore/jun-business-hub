"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FileCategory } from "@prisma/client";
import { DRIVE_INTEL_PREFIX, DRIVE_TAGS_PREFIX, getDriveIntelligence, indexDriveFile, type DriveIntelligence } from "@/lib/drive-intelligence";

const CATEGORIES = ["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"] as const;

function safeReturn(formData?: FormData) {
  const value = String(formData?.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : "/app/drive";
}

function toast(path: string, key: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

function cleanArray(value: unknown, max = 12) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean).slice(0, max);
}

function parseAIJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch { return null; }
}

async function runAnalysis(fileId: string) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, isVault: false, archivedAt: null },
    include: { client: true, case: true, folder: true },
  });
  if (!file) return { error: "File not found" as const };

  const indexed = await indexDriveFile(file.id);
  const current = indexed?.intelligence ?? (await getDriveIntelligence(file.id)).intelligence;
  const excerpt = current?.contentExcerpt ?? "";
  const context = [
    `Filename: ${file.name}`,
    `Current category: ${file.category}`,
    `MIME type: ${file.mimeType}`,
    file.folder ? `Folder: ${file.folder.name}` : "",
    file.client ? `Linked client: ${file.client.firstName} ${file.client.lastName} (${file.client.internalId})` : "",
    file.case ? `Linked case: ${file.case.caseNumber} — ${file.case.title}` : "",
    excerpt ? `Extracted content:\n${excerpt.slice(0, 12000)}` : "Extracted content: unavailable for this file type. Analyze only from metadata and do not invent document contents.",
  ].filter(Boolean).join("\n");

  if (!process.env.OPENAI_API_KEY) return { error: "OPENAI_API_KEY is not configured" as const };

  try {
    const { generateText } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    const result = await generateText({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      system: `You analyze internal business files for JUN CREATIF AND TRAVEL LLC. Return ONLY valid JSON. Never invent facts. If content is unavailable, explicitly keep facts empty and infer only safe metadata such as likely category. Allowed categories: ${CATEGORIES.join(", ")}.`,
      prompt: `${context}\n\nReturn JSON with keys: summary (string, max 600 chars), language (string), suggestedCategory (one allowed category), tags (array max 8), people (array max 10), organizations (array max 10), importantDates (array max 10), keyFacts (array max 10).`,
      temperature: 0.1,
    });
    const parsed = parseAIJson(result.text);
    if (!parsed) return { error: "AI returned invalid JSON" as const };
    const suggestedCategory = CATEGORIES.includes(String(parsed.suggestedCategory ?? "OTHER") as typeof CATEGORIES[number]) ? String(parsed.suggestedCategory) : "OTHER";
    const intelligence: DriveIntelligence = {
      indexedAt: current?.indexedAt ?? new Date().toISOString(),
      contentExcerpt: current?.contentExcerpt ?? "",
      searchableText: current?.searchableText ?? file.name,
      summary: String(parsed.summary ?? "").trim().slice(0, 600),
      language: String(parsed.language ?? "Unknown").trim().slice(0, 60),
      suggestedCategory,
      tags: cleanArray(parsed.tags, 8),
      people: cleanArray(parsed.people, 10),
      organizations: cleanArray(parsed.organizations, 10),
      importantDates: cleanArray(parsed.importantDates, 10),
      keyFacts: cleanArray(parsed.keyFacts, 10),
      aiAnalyzedAt: new Date().toISOString(),
    };
    await prisma.appSetting.upsert({
      where: { key: `${DRIVE_INTEL_PREFIX}${file.id}` },
      update: { value: JSON.stringify(intelligence) },
      create: { key: `${DRIVE_INTEL_PREFIX}${file.id}`, value: JSON.stringify(intelligence) },
    });
    return { intelligence };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI analysis failed" };
  }
}

export async function analyzeDriveFile(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("AI_USE");
  await assertPermission("FILE_READ");
  const returnTo = safeReturn(formData);
  const result = await runAnalysis(fileId);
  if ("error" in result) redirect(toast(returnTo, "toast_error", result.error));
  await audit({ userId: user.id, action: "FILE_AI_ANALYZE", resourceType: "File", resourceId: fileId, after: { suggestedCategory: result.intelligence.suggestedCategory } });
  await logActivity({ userId: user.id, type: "FILE_AI_ANALYZED", message: "AI document intelligence generated", resourceType: "File", resourceId: fileId });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Document intelligence updated"));
}

export async function saveDriveTags(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: null }, select: { id: true } });
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));
  const tags = String(formData.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
  const key = `${DRIVE_TAGS_PREFIX}${file.id}`;
  if (tags.length) await prisma.appSetting.upsert({ where: { key }, update: { value: JSON.stringify(tags) }, create: { key, value: JSON.stringify(tags) } });
  else await prisma.appSetting.deleteMany({ where: { key } });
  await audit({ userId: user.id, action: "FILE_TAGS_UPDATE", resourceType: "File", resourceId: file.id, after: { tags } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Tags saved"));
}

export async function acceptDriveSuggestedCategory(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: null } });
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));
  const { intelligence } = await getDriveIntelligence(file.id);
  const suggested = intelligence?.suggestedCategory;
  if (!suggested || !CATEGORIES.includes(suggested as typeof CATEGORIES[number])) redirect(toast(returnTo, "toast_error", "No valid AI category suggestion"));
  const next = suggested as FileCategory;
  if (next !== file.category) {
    await prisma.file.update({ where: { id: file.id }, data: { category: next } });
    await audit({ userId: user.id, action: "FILE_AI_CATEGORY_ACCEPT", resourceType: "File", resourceId: file.id, before: { category: file.category }, after: { category: next } });
  }
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Suggested category accepted"));
}
