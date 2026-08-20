import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FileText, ShieldCheck, Download } from "lucide-react";

export const dynamic = "force-dynamic";

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PublicFileViewer({ params }: { params: { id: string } }) {
  const file = await prisma.file.findFirst({
    where: { id: params.id, isVault: false, archivedAt: null },
    select: { id: true, name: true, mimeType: true, sizeBytes: true, category: true, createdAt: true },
  });
  if (!file) notFound();

  const rawUrl = `/public/files/${file.id}`;
  const previewable = file.mimeType === "application/pdf" || file.mimeType.startsWith("image/") || file.mimeType.startsWith("text/");

  return (
    <main className="min-h-screen bg-[#07101f] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">
                <ShieldCheck className="h-4 w-4" /> JUN shared document
              </div>
              <h1 className="truncate text-xl font-semibold">{file.name}</h1>
              <p className="mt-1 text-sm text-white/55">
                {file.category.replace(/_/g, " ")} · {humanSize(file.sizeBytes)} · Shared from JUN Business Hub
              </p>
            </div>
          </div>
          <a href={rawUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-400">
            <Download className="h-4 w-4" /> Open file
          </a>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
          {previewable ? (
            <iframe src={rawUrl} title={file.name} className="h-[78vh] min-h-[620px] w-full bg-white" />
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center text-slate-900">
              <FileText className="mb-4 h-12 w-12 text-slate-400" />
              <h2 className="text-lg font-semibold">Preview not available for this file type</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">Use “Open file” to view or download the original document.</p>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-white/35">This public link is intended for document sharing. The underlying storage file remains private and is served through temporary access.</p>
      </div>
    </main>
  );
}
