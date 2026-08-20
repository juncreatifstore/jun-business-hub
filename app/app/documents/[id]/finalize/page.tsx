import Link from "next/link";
import { ArrowLeft, FileCheck2, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";
import { finalizeDocument } from "@/services/documents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function FinalizeDocumentPage({ params, searchParams }: { params: { id: string }; searchParams?: { error?: string } }) {
  await requirePermission("DOCUMENT_EDIT");
  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: { client: true, case: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc) notFound();
  if (doc.status !== "DRAFT") redirect(`/app/documents/${doc.id}?toast_error=${encodeURIComponent("Only DRAFT documents can be finalized")}`);
  const latest = doc.versions[0];
  if (!latest) redirect(`/app/documents/${doc.id}?toast_error=${encodeURIComponent("Document has no content to finalize")}`);

  const contentHash = sha256(latest.content);

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/app/documents/${doc.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric">
          <ArrowLeft className="h-4 w-4" /> Back to document
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="registry-id text-muted2">{doc.documentId}</p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">Finalization preview <StatusBadge status={doc.status} /></h1>
          <p className="mt-1 text-sm text-muted2">Review the exact current draft before JUN seals the official PDF.</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Version {latest.version} · content SHA-256 {contentHash.slice(0, 16)}…
        </div>
      </div>

      {searchParams?.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{searchParams.error}</div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>PDF preview</CardTitle>
              <p className="mt-1 text-xs text-muted2">This preview is generated from the current draft version.</p>
            </div>
            <a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer"><Button variant="outline">Open PDF</Button></a>
          </CardHeader>
          <CardContent>
            <iframe title="Finalization preview" src={`/api/documents/${doc.id}/pdf`} className="h-[760px] w-full rounded-xl border border-line bg-surface" />
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Document being sealed</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><p className="text-xs uppercase tracking-wide text-muted2">Title</p><p className="font-medium">{doc.title}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Type</p><p>{doc.type.replaceAll("_", " ")}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Client</p><p>{doc.client ? `${doc.client.firstName} ${doc.client.lastName}` : "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Case</p><p>{doc.case?.caseNumber ?? "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Version</p><p>v{latest.version}</p></div>
            </CardContent>
          </Card>

          <Card className="border-amber-200">
            <CardHeader><CardTitle className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-amber-600" /> Finalization consequences</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted2">
              <p className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> JUN creates and stores the official PDF as immutable final evidence.</p>
              <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> A SHA-256 hash is recorded for both the document content and the stored PDF bytes.</p>
              <p className="flex gap-2"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" /> Editing a FINAL document requires a new revision. The sealed PDF remains preserved in the audit history.</p>
            </CardContent>
          </Card>

          <form action={finalizeDocument.bind(null, doc.id)} className="rounded-xl border border-line bg-white p-5 shadow-sm">
            <input type="hidden" name="confirm" value="FINALIZE" />
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" required className="mt-1" />
              <span>I reviewed the PDF preview and confirm that version {latest.version} is ready to become the official FINAL document.</span>
            </label>
            <Button type="submit" variant="gold" className="mt-5 w-full">Finalize & seal PDF</Button>
            <Link href={`/app/documents/${doc.id}`} className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-line text-sm font-medium hover:bg-surface">Cancel</Link>
          </form>
        </aside>
      </div>
    </div>
  );
}
