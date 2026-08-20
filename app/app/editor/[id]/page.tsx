import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, GitCompareArrows, Eye, CheckCircle2, PanelsTopLeft, Scissors } from "lucide-react";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { DocumentEditor } from "@/components/app/document-editor";
import { saveDocumentVersion } from "@/services/documents";

export const dynamic = "force-dynamic";

export default async function EditorWorkspace({ params }: { params: { id: string } }) {
  const user = await requirePermission("DOCUMENT_READ");
  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: { versions: { orderBy: { version: "desc" }, take: 1 }, client: true, case: true },
  });
  if (!doc) notFound();
  const latest = doc.versions[0];
  const editable = can(user, "DOCUMENT_EDIT") && doc.status === "DRAFT";

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/app/editor" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Back to Editor dashboard"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{doc.title}</p><p className="registry-id truncate text-[10px] text-slate-500">{doc.documentId} · v{latest?.version ?? 1}</p></div>
            <StatusBadge status={doc.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/app/editor/${doc.id}/pages`}><Button variant="outline"><PanelsTopLeft className="mr-1.5 h-4 w-4" />Pages</Button></Link>
            <Link href={`/app/editor/${doc.id}/split`}><Button variant="outline"><Scissors className="mr-1.5 h-4 w-4" />Split</Button></Link>
            <Link href={`/app/documents/${doc.id}`}><Button variant="ghost"><FileText className="mr-1.5 h-4 w-4" />Document info</Button></Link>
            <Link href={`/app/documents/${doc.id}/versions`}><Button variant="outline"><GitCompareArrows className="mr-1.5 h-4 w-4" />Versions</Button></Link>
            <Link href={`/app/documents/${doc.id}/fill`}><Button variant="outline"><Eye className="mr-1.5 h-4 w-4" />Preview / Fill</Button></Link>
            {editable ? <Link href={`/app/documents/${doc.id}/finalize`}><Button variant="gold"><CheckCircle2 className="mr-1.5 h-4 w-4" />Done / Finalize</Button></Link> : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-61px)]">
        <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-3 xl:block">
          <div className="flex items-center justify-between px-2 py-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pages</p><Link href={`/app/editor/${doc.id}/pages`} className="text-[10px] font-semibold text-electric hover:underline">Manage</Link></div>
          <Link href={`/app/editor/${doc.id}/pages`} className="block rounded-lg border-2 border-blue-500 bg-white p-2 shadow-sm hover:bg-blue-50/40">
            <div className="flex aspect-[0.72] items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs text-slate-400">Page manager</div>
            <p className="mt-2 text-center text-xs font-medium text-slate-700">Open pages</p>
          </Link>
          <p className="mt-3 text-[11px] leading-4 text-slate-400">Reorder, rotate, duplicate, add, delete and split pages.</p>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-[1040px]">
            {!editable ? <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This document is read-only in the editor because its current status is {doc.status}. Create a revision from Document info to edit again.</div> : null}
            <DocumentEditor documentId={doc.id} initialContent={latest?.content ?? "<p></p>"} action={saveDocumentVersion.bind(null, doc.id)} readOnly={!editable} />
          </div>
        </main>

        <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-white p-4 2xl:block">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Properties</p>
          <div className="mt-4 space-y-4 text-sm">
            <div><p className="text-xs text-slate-400">Document type</p><p className="font-medium text-slate-700">{doc.type.replaceAll("_", " ")}</p></div>
            <div><p className="text-xs text-slate-400">Client</p><p className="font-medium text-slate-700">{doc.client ? `${doc.client.firstName} ${doc.client.lastName}` : "—"}</p></div>
            <div><p className="text-xs text-slate-400">Case</p><p className="registry-id text-slate-700">{doc.case?.caseNumber ?? "—"}</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">Select a text block, image, field or annotation to edit its properties here.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
