import Link from "next/link";
import { ArrowLeft, Copy, Power, WandSparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { type DocumentTemplateRow, parseTemplateVariables } from "@/lib/document-templates";
import { DocumentTemplateForm } from "@/components/app/document-template-form";
import { Button } from "@/components/ui/button";
import { updateDocumentTemplate, duplicateDocumentTemplate, toggleDocumentTemplate, convertReferenceTemplate } from "@/services/document-templates";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("DOCUMENT_READ");
  const rows = await prisma.$queryRaw<DocumentTemplateRow[]>`
    SELECT id,name,type::text AS type,content,category,language,description,variables,"isActive","isReference","sourceRef","createdById","createdAt","updatedAt"
    FROM "DocumentTemplate" WHERE id=${params.id} LIMIT 1
  `;
  const template = rows[0];
  if (!template) notFound();
  const editable = can(user, "DOCUMENT_EDIT");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/documents/templates" className="inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric"><ArrowLeft className="h-4 w-4" /> Back to Template Library</Link>
        <div className="flex flex-wrap gap-2">
          {can(user, "DOCUMENT_CREATE") ? <form action={duplicateDocumentTemplate.bind(null, template.id)}><Button type="submit" variant="outline"><Copy className="mr-1.5 h-4 w-4" />Duplicate</Button></form> : null}
          {editable && !template.isReference ? <form action={toggleDocumentTemplate.bind(null, template.id)}><Button type="submit" variant="outline"><Power className="mr-1.5 h-4 w-4" />{template.isActive ? "Deactivate" : "Activate"}</Button></form> : null}
          {editable && template.isReference ? <form action={convertReferenceTemplate.bind(null, template.id)}><Button type="submit" variant="primary"><WandSparkles className="mr-1.5 h-4 w-4" />Convert to editable template</Button></form> : null}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{template.name}</h1>{template.isReference ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">REFERENCE</span> : template.isActive ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">ACTIVE</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">INACTIVE</span>}</div>
        <p className="mt-1 text-sm text-muted2">{template.type.replaceAll("_"," ")} · {template.language} · {template.category}</p>
        {template.sourceRef ? <p className="mt-1 text-xs text-muted2">Source reference: {template.sourceRef}</p> : null}
      </div>

      {template.isReference ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold">Reference catalog entry</h2>
          <p className="mt-2 text-sm text-amber-900">This record represents a document type from the imported administrative catalog. It is not presented as a completed legal template. Convert it first, review/add the actual content, then activate it for document creation.</p>
          <div className="mt-4 rounded-lg border border-amber-200 bg-white p-4 text-sm"><p><strong>Detected variables:</strong> {parseTemplateVariables(template.variables).length}</p><p className="mt-1"><strong>Content status:</strong> {template.content.trim() ? "Starter content exists" : "No content yet"}</p></div>
        </div>
      ) : editable ? (
        <DocumentTemplateForm action={updateDocumentTemplate.bind(null, template.id)} initial={template} submitLabel="Save template" />
      ) : (
        <div className="doc-prose rounded-xl border border-line bg-white p-6" dangerouslySetInnerHTML={{ __html: template.content }} />
      )}
    </div>
  );
}
