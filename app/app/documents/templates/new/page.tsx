import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createDocumentTemplate } from "@/services/document-templates";
import { DocumentTemplateForm } from "@/components/app/document-template-form";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  await requirePermission("DOCUMENT_CREATE");
  return (
    <div>
      <Link href="/app/documents/templates" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric"><ArrowLeft className="h-4 w-4" /> Back to Template Library</Link>
      <div className="mb-6"><h1 className="text-2xl font-semibold">New template</h1><p className="mt-1 text-sm text-muted2">Create a reusable JUN template with categories and dynamic variables.</p></div>
      <DocumentTemplateForm action={createDocumentTemplate} submitLabel="Create template" />
    </div>
  );
}
