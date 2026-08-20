"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { nextNumber, DOC_PREFIX } from "@/lib/sequence";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { sha256 } from "@/lib/hash";

function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function requiredFields(html: string): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];
  const tags = html.match(/<div\b[^>]*data-jun-field=["']true["'][^>]*>/gi) ?? [];
  for (const tag of tags) {
    const required = /data-required=["']true["']/i.test(tag);
    if (!required) continue;
    const name = tag.match(/data-field-name=["']([^"']*)["']/i)?.[1] ?? "";
    const type = (tag.match(/data-field-type=["']([^"']*)["']/i)?.[1] ?? "TEXT").toUpperCase();
    if (name && type !== "FORMULA") fields.push({ name: decodeAttr(name), type });
  }
  return fields;
}

function hasValue(value: unknown, type: string): boolean {
  if (type === "CHECKBOX") return value === true || value === "true";
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export async function createFilledDocument(sourceDocumentId: string, formData: FormData) {
  const user = await assertPermission("DOCUMENT_CREATE");
  const source = await prisma.document.findUnique({
    where: { id: sourceDocumentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!source || !source.versions[0]) {
    redirect(`/app/documents/${sourceDocumentId}?toast_error=${encodeURIComponent("Source document is no longer available")}`);
  }

  const sourceVersion = source.versions[0];
  let values: Record<string, unknown> = {};
  try {
    const raw = String(formData.get("values") ?? "{}");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) values = parsed as Record<string, unknown>;
  } catch {
    redirect(`/app/documents/${sourceDocumentId}/fill?error=${encodeURIComponent("The filled values could not be validated")}`);
  }

  const missing = requiredFields(sourceVersion.content)
    .filter((field) => !hasValue(values[field.name], field.type))
    .map((field) => field.name);
  if (missing.length) {
    redirect(`/app/documents/${sourceDocumentId}/fill?error=${encodeURIComponent(`Required fields missing: ${missing.join(", ")}`)}`);
  }

  const rawFilledHtml = String(formData.get("filledHtml") ?? "").slice(0, 500_000);
  const filledHtml = sanitizeDocumentHtml(rawFilledHtml);
  if (!filledHtml.trim()) {
    redirect(`/app/documents/${sourceDocumentId}/fill?error=${encodeURIComponent("Filled document content is empty")}`);
  }

  const documentId = await nextNumber(DOC_PREFIX[source.type] ?? "JUN-DOC");
  const titleSuffix = String(formData.get("copyTitle") ?? "").trim().slice(0, 180);
  const title = titleSuffix || `${source.title} — Filled copy`;
  const valueNames = Object.keys(values).slice(0, 100);

  const copy = await prisma.document.create({
    data: {
      documentId,
      type: source.type,
      title,
      clientId: source.clientId,
      caseId: source.caseId,
      authorId: user.id,
      versions: {
        create: {
          version: 1,
          content: filledHtml,
          authorId: user.id,
          changeNote: `Filled copy from ${source.documentId} v${sourceVersion.version}`.slice(0, 300),
          hash: sha256(filledHtml),
        },
      },
    },
  });

  await audit({
    userId: user.id,
    action: "DOCUMENT_FILLED_COPY_CREATE",
    resourceType: "Document",
    resourceId: copy.id,
    after: {
      documentId,
      sourceDocumentId: source.documentId,
      sourceVersion: sourceVersion.version,
      fieldNames: valueNames,
      fieldCount: valueNames.length,
    },
  });
  await logActivity({
    type: "DOCUMENT_CREATED",
    message: `Filled copy ${documentId} created from ${source.documentId}`,
    userId: user.id,
    clientId: copy.clientId,
    caseId: copy.caseId,
  });

  redirect(`/app/documents/${copy.id}?toast=${encodeURIComponent(`Filled copy ${documentId} created`)}`);
}
