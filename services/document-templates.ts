"use server";
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { extractTemplateVariableKeys, mergeVariableDefinitions, type TemplateVariableDefinition } from "@/lib/document-templates";

const ALLOWED_TYPES = new Set(["CONTRACT","AGREEMENT","REFUND_AGREEMENT","RECEIPT","INVOICE","LETTER","ATTESTATION","AUTHORIZATION","REPORT","CUSTOM"]);
const ALLOWED_LANGUAGES = new Set(["FR","EN","ES","HT"]);

function str(fd: FormData, key: string, max = 5000) {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

function parseVariables(fd: FormData, content: string): TemplateVariableDefinition[] {
  let defined: TemplateVariableDefinition[] = [];
  const raw = str(fd, "variablesJson", 100_000);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) defined = parsed as TemplateVariableDefinition[];
    } catch {}
  }
  return mergeVariableDefinitions(content, defined);
}

export async function createDocumentTemplate(formData: FormData) {
  const user = await assertPermission("DOCUMENT_CREATE");
  const name = str(formData, "name", 200);
  const type = str(formData, "type", 50);
  const category = str(formData, "category", 80) || "GENERAL";
  const language = str(formData, "language", 5) || "FR";
  const description = str(formData, "description", 2000) || null;
  const isActive = String(formData.get("isActive") ?? "") === "on";
  const content = sanitizeDocumentHtml(str(formData, "content", 500_000));
  if (!name || !ALLOWED_TYPES.has(type) || !ALLOWED_LANGUAGES.has(language) || !content) {
    redirect(`/app/documents/templates/new?toast_error=${encodeURIComponent("Name, type, language and content are required")}`);
  }
  const variables = parseVariables(formData, content);
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "DocumentTemplate" (id,name,type,content,"createdAt","updatedAt",category,language,description,variables,"isActive","isReference","sourceRef","createdById")
    VALUES (${id},${name},${type}::"DocumentType",${content},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,${category},${language},${description},${JSON.stringify(variables)}::jsonb,${isActive},false,NULL,${user.id})
  `;
  await audit({ userId: user.id, action: "DOCUMENT_TEMPLATE_CREATE", resourceType: "DocumentTemplate", resourceId: id, after: { name, type, category, language, isActive, variables: extractTemplateVariableKeys(content) } });
  await logActivity({ type: "DOCUMENT_TEMPLATE_CREATED", message: `Template created: ${name}`, userId: user.id, resourceType: "DocumentTemplate", resourceId: id });
  revalidatePath("/app/documents/templates");
  redirect(`/app/documents/templates/${id}?toast=${encodeURIComponent("Template created")}`);
}

export async function updateDocumentTemplate(templateId: string, formData: FormData) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const name = str(formData, "name", 200);
  const type = str(formData, "type", 50);
  const category = str(formData, "category", 80) || "GENERAL";
  const language = str(formData, "language", 5) || "FR";
  const description = str(formData, "description", 2000) || null;
  const isActive = String(formData.get("isActive") ?? "") === "on";
  const content = sanitizeDocumentHtml(str(formData, "content", 500_000));
  if (!name || !ALLOWED_TYPES.has(type) || !ALLOWED_LANGUAGES.has(language) || !content) {
    redirect(`/app/documents/templates/${templateId}?toast_error=${encodeURIComponent("Name, type, language and content are required")}`);
  }
  const variables = parseVariables(formData, content);
  const before = await prisma.$queryRaw<Array<{ name: string; type: string; category: string; language: string; isActive: boolean }>>`
    SELECT name,type::text AS type,category,language,"isActive" FROM "DocumentTemplate" WHERE id=${templateId} LIMIT 1
  `;
  if (!before[0]) redirect(`/app/documents/templates?toast_error=${encodeURIComponent("Template not found")}`);
  await prisma.$executeRaw`
    UPDATE "DocumentTemplate" SET name=${name},type=${type}::"DocumentType",content=${content},category=${category},language=${language},description=${description},variables=${JSON.stringify(variables)}::jsonb,"isActive"=${isActive},"isReference"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${templateId}
  `;
  await audit({ userId: user.id, action: "DOCUMENT_TEMPLATE_UPDATE", resourceType: "DocumentTemplate", resourceId: templateId, before: before[0], after: { name, type, category, language, isActive, variables: extractTemplateVariableKeys(content) } });
  revalidatePath("/app/documents/templates");
  revalidatePath(`/app/documents/templates/${templateId}`);
  redirect(`/app/documents/templates/${templateId}?toast=${encodeURIComponent("Template saved")}`);
}

export async function duplicateDocumentTemplate(templateId: string) {
  const user = await assertPermission("DOCUMENT_CREATE");
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; content: string; category: string; language: string; description: string | null; variables: unknown }>>`
    SELECT name,type::text AS type,content,category,language,description,variables FROM "DocumentTemplate" WHERE id=${templateId} LIMIT 1
  `;
  const source = rows[0];
  if (!source) redirect(`/app/documents/templates?toast_error=${encodeURIComponent("Template not found")}`);
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "DocumentTemplate" (id,name,type,content,"createdAt","updatedAt",category,language,description,variables,"isActive","isReference","sourceRef","createdById")
    VALUES (${id},${`${source.name} (copy)`},${source.type}::"DocumentType",${source.content},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,${source.category},${source.language},${source.description},${JSON.stringify(source.variables ?? [])}::jsonb,false,false,NULL,${user.id})
  `;
  await audit({ userId: user.id, action: "DOCUMENT_TEMPLATE_DUPLICATE", resourceType: "DocumentTemplate", resourceId: id, after: { from: templateId } });
  revalidatePath("/app/documents/templates");
  redirect(`/app/documents/templates/${id}?toast=${encodeURIComponent("Template duplicated as inactive copy")}`);
}

export async function toggleDocumentTemplate(templateId: string) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const rows = await prisma.$queryRaw<Array<{ isActive: boolean; isReference: boolean; content: string }>>`SELECT "isActive","isReference",content FROM "DocumentTemplate" WHERE id=${templateId} LIMIT 1`;
  const current = rows[0];
  if (!current) return;
  const next = !current.isActive;
  if (next && current.isReference && !current.content.trim()) {
    redirect(`/app/documents/templates/${templateId}?toast_error=${encodeURIComponent("Add usable content before activating a reference template")}`);
  }
  await prisma.$executeRaw`UPDATE "DocumentTemplate" SET "isActive"=${next},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${templateId}`;
  await audit({ userId: user.id, action: next ? "DOCUMENT_TEMPLATE_ACTIVATE" : "DOCUMENT_TEMPLATE_DEACTIVATE", resourceType: "DocumentTemplate", resourceId: templateId });
  revalidatePath("/app/documents/templates");
  revalidatePath(`/app/documents/templates/${templateId}`);
  redirect(`/app/documents/templates/${templateId}?toast=${encodeURIComponent(next ? "Template activated" : "Template deactivated")}`);
}

export async function convertReferenceTemplate(templateId: string) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const rows = await prisma.$queryRaw<Array<{ name: string; content: string }>>`SELECT name,content FROM "DocumentTemplate" WHERE id=${templateId} LIMIT 1`;
  if (!rows[0]) return;
  const content = rows[0].content.trim() || `<h1>{{document.title}}</h1><p>[Complete this JUN template before activation.]</p>`;
  await prisma.$executeRaw`UPDATE "DocumentTemplate" SET "isReference"=false,"isActive"=false,content=${content},variables=${JSON.stringify(mergeVariableDefinitions(content, []))}::jsonb,"updatedAt"=CURRENT_TIMESTAMP,"createdById"=${user.id} WHERE id=${templateId}`;
  await audit({ userId: user.id, action: "DOCUMENT_TEMPLATE_REFERENCE_CONVERT", resourceType: "DocumentTemplate", resourceId: templateId, after: { name: rows[0].name } });
  revalidatePath("/app/documents/templates");
  redirect(`/app/documents/templates/${templateId}?toast=${encodeURIComponent("Reference converted to editable template")}`);
}
