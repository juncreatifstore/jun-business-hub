"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FileCategory } from "@prisma/client";
import { DRIVE_INTEL_PREFIX, DRIVE_TAGS_PREFIX, getDriveIntelligence, indexDriveFile, type DriveIntelligence } from "@/lib/drive-intelligence";

const CATEGORIES = ["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"] as const;

type AnalysisResult =
  | { ok: true; intelligence: DriveIntelligence }
  | { ok: false; error: string };

function safeReturn(formData?: FormData) {
  const value = String(formData?.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : "/app/drive";
}

function toast(path: string, key: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

function cleanArray(value: unknown, max = 15) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean).slice(0, max);
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function parseAIJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch { return null; }
}

function extractResponsesText(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const output = (body as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") chunks.push(text);
      }
    }
  }
  return chunks.join("\n").trim();
}

async function richOpenAIAnalysis(input: { fileName: string; mimeType: string; context: string; buffer?: Buffer }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: `${input.context}\n\nAnalyze this file as an operations-grade document analyst. Return ONLY valid JSON with these keys:\nsummary: concise executive summary;\ndetailedDescription: explanatory description useful to a staff member who has not opened the file;\ndocumentPurpose: what this document/image appears to be for and how it may be used operationally;\nvisualDescription: for images/scans, describe visible layout, objects, stamps, signatures, document structure and notable visual details without identifying a real person's identity from appearance; for non-visual files use an empty string;\nlanguage;\nsuggestedCategory: one of ${CATEGORIES.join(", ")};\ntags: array;\npeople: names explicitly written in the file only;\norganizations: array;\nimportantDates: array with context;\nkeyFacts: array of concrete useful facts;\nactionItems: array of recommended next checks/actions;\nrisks: array of inconsistencies, expiry concerns, missing signatures/pages, unclear items, or operational risks;\nmissingInformation: array of information that appears necessary but is absent or unreadable.\n\nBe explicit and useful. Never invent facts. Distinguish clearly between what is visible, what is extracted, and what is uncertain. Do not make legal conclusions.`,
  }];

  if (input.buffer && input.buffer.length <= 18 * 1024 * 1024) {
    const b64 = input.buffer.toString("base64");
    if (input.mimeType.startsWith("image/")) {
      content.push({ type: "input_image", image_url: `data:${input.mimeType};base64,${b64}`, detail: "high" });
    } else if (input.mimeType === "application/pdf" || input.mimeType.startsWith("text/") || input.mimeType.includes("wordprocessingml") || input.mimeType.includes("spreadsheetml")) {
      content.push({ type: "input_file", filename: input.fileName, file_data: `data:${input.mimeType};base64,${b64}`, detail: "auto" });
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      input: [{ role: "user", content }],
      temperature: 0.1,
      max_output_tokens: 2200,
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`AI analysis failed (${response.status})${message ? `: ${message.slice(0, 300)}` : ""}`);
  }
  return extractResponsesText(await response.json());
}

async function runAnalysis(fileId: string): Promise<AnalysisResult> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, isVault: false, archivedAt: null },
    include: { client: true, case: true, folder: true },
  });
  if (!file) return { ok: false, error: "File not found" };

  let buffer: Buffer | undefined;
  try { buffer = await storage().download(file.storageKey); } catch { buffer = undefined; }
  const indexed = await indexDriveFile(file.id, buffer);
  const current = indexed?.intelligence ?? (await getDriveIntelligence(file.id)).intelligence;
  const excerpt = current?.contentExcerpt ?? "";
  const context = [
    `Filename: ${file.name}`,
    `Current category: ${file.category}`,
    `MIME type: ${file.mimeType}`,
    file.folder ? `Folder: ${file.folder.name}` : "",
    file.client ? `Linked client: ${file.client.firstName} ${file.client.lastName} (${file.client.internalId})` : "",
    file.case ? `Linked case: ${file.case.caseNumber} — ${file.case.title}` : "",
    excerpt ? `Previously extracted text:\n${excerpt.slice(0, 12000)}` : "Previously extracted text: unavailable or not applicable.",
  ].filter(Boolean).join("\n");

  try {
    const raw = await richOpenAIAnalysis({ fileName: file.name, mimeType: file.mimeType, context, buffer });
    const parsed = parseAIJson(raw);
    if (!parsed) return { ok: false, error: "AI returned invalid JSON" };
    const suggestedCategory = CATEGORIES.includes(String(parsed.suggestedCategory ?? "OTHER") as typeof CATEGORIES[number]) ? String(parsed.suggestedCategory) : "OTHER";
    const intelligence: DriveIntelligence = {
      indexedAt: current?.indexedAt ?? new Date().toISOString(),
      contentExcerpt: current?.contentExcerpt ?? "",
      searchableText: current?.searchableText ?? file.name,
      summary: cleanText(parsed.summary, 1200),
      detailedDescription: cleanText(parsed.detailedDescription, 5000),
      documentPurpose: cleanText(parsed.documentPurpose, 1800),
      visualDescription: cleanText(parsed.visualDescription, 3000),
      language: cleanText(parsed.language || "Unknown", 80),
      suggestedCategory,
      tags: cleanArray(parsed.tags, 12),
      people: cleanArray(parsed.people, 15),
      organizations: cleanArray(parsed.organizations, 15),
      importantDates: cleanArray(parsed.importantDates, 15),
      keyFacts: cleanArray(parsed.keyFacts, 20),
      actionItems: cleanArray(parsed.actionItems, 15),
      risks: cleanArray(parsed.risks, 15),
      missingInformation: cleanArray(parsed.missingInformation, 15),
      aiAnalyzedAt: new Date().toISOString(),
    };
    await prisma.appSetting.upsert({
      where: { key: `${DRIVE_INTEL_PREFIX}${file.id}` },
      update: { value: JSON.stringify(intelligence) },
      create: { key: `${DRIVE_INTEL_PREFIX}${file.id}`, value: JSON.stringify(intelligence) },
    });
    return { ok: true, intelligence };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI analysis failed" };
  }
}

export async function analyzeDriveFile(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("AI_USE");
  await assertPermission("FILE_READ");
  const returnTo = safeReturn(formData);
  const result = await runAnalysis(fileId);
  if (!result.ok) redirect(toast(returnTo, "toast_error", result.error));
  await audit({ userId: user.id, action: "FILE_AI_ANALYZE", resourceType: "File", resourceId: fileId, after: { suggestedCategory: result.intelligence.suggestedCategory, richAnalysis: true } });
  await logActivity({ userId: user.id, type: "FILE_AI_ANALYZED", message: "Rich AI file intelligence generated", resourceType: "File", resourceId: fileId });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Detailed file intelligence updated"));
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
