"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { documentSchema, emptyToNull } from "@/lib/validation";
import { nextNumber, DOC_PREFIX } from "@/lib/sequence";
import { sha256 } from "@/lib/hash";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { buildAutomaticTemplateContext, parseTemplateVariables, renderTemplateContent } from "@/lib/document-templates";
import type { FormState } from "@/services/clients";

type TemplateRow = { id: string; name: string; type: string; content: string; variables: unknown; isActive: boolean; isReference: boolean };

export async function createDocumentD5(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("DOCUMENT_CREATE");
  const parsed = documentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const clientId = emptyToNull(d.clientId);
  const caseId = emptyToNull(d.caseId);

  if (caseId) {
    const selectedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
    if (!selectedCase) return { message: "The selected case is no longer available." };
    if (clientId && selectedCase.clientId !== clientId) return { message: "The selected case does not belong to the selected client." };
  }

  let template: TemplateRow | null = null;
  if (d.templateId) {
    const rows = await prisma.$queryRaw<TemplateRow[]>`
      SELECT id,name,type::text AS type,content,variables,"isActive","isReference"
      FROM "DocumentTemplate" WHERE id=${d.templateId} LIMIT 1
    `.catch(() => [] as TemplateRow[]);
    template = rows[0] ?? null;
    if (!template || !template.isActive || template.isReference) return { message: "This template is not active or is no longer available." };
  }

  let content = d.content;
  const variableValues: Record<string,string> = {};
  const unresolved: string[] = [];

  if (template) {
    if (!content) content = template.content;
    const auto = await buildAutomaticTemplateContext({ clientId, caseId, documentTitle: d.title });
    Object.assign(variableValues, auto);
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("var:")) variableValues[key.slice(4)] = String(value ?? "").trim().slice(0, 5000);
    }
    const definitions = parseTemplateVariables(template.variables);
    const missingRequired = definitions.filter((v) => v.required && !v.automatic && !variableValues[v.key] && !v.defaultValue);
    if (missingRequired.length) return { message: `Complete required template variables: ${missingRequired.map((v) => v.label ?? v.key).join(", ")}.` };
    for (const def of definitions) if (!variableValues[def.key] && def.defaultValue) variableValues[def.key] = def.defaultValue;
    const rendered = renderTemplateContent(content, variableValues);
    content = rendered.content;
    unresolved.push(...rendered.unresolved);
  }

  if (!content) content = `<h1>${d.title}</h1><p></p>`;
  content = sanitizeDocumentHtml(content);
  const sourceNote = template ? `Template: ${template.name}` : "Blank / custom";
  const changeNote = `Initial draft · Language: ${d.language} · Source: ${sourceNote}${unresolved.length ? ` · Unresolved: ${unresolved.join(", ")}` : ""}`.slice(0, 300);
  const documentId = await nextNumber(DOC_PREFIX[d.type] ?? "JUN-DOC");
  const doc = await prisma.document.create({
    data: {
      documentId,
      type: d.type,
      title: d.title,
      clientId,
      caseId,
      authorId: user.id,
      versions: { create: { version: 1, content, authorId: user.id, changeNote, hash: sha256(content) } },
    },
  });
  await audit({
    userId: user.id,
    action: "DOCUMENT_CREATE",
    resourceType: "Document",
    resourceId: doc.id,
    after: { documentId, type: d.type, title: d.title, language: d.language, templateId: template?.id ?? null, templateName: template?.name ?? null, resolvedVariableKeys: Object.keys(variableValues), unresolvedVariableKeys: unresolved },
  });
  await logActivity({ type: "DOCUMENT_CREATED", message: `Document ${documentId} created: ${d.title}`, userId: user.id, clientId: doc.clientId, caseId: doc.caseId });
  redirect(`/app/documents/${doc.id}?toast=${encodeURIComponent(`Document ${documentId} created`)}`);
}
