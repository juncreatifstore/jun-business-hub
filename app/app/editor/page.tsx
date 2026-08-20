import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import {
  Search, Upload, PenLine, UserRoundPen, Link2, Files, PanelsTopLeft,
  Clock3, AlertTriangle, FileEdit, UsersRound, CheckCircle2, MoreHorizontal,
} from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; view?: string };

const tools = [
  { label: "Upload / create", description: "Start from a document or blank page", href: "/app/documents/new", icon: Upload },
  { label: "Edit document", description: "Open a draft in the full editor", href: "/app/editor?view=drafts", icon: PenLine },
  { label: "Request e-signatures", description: "Prepare a document for other signers", href: "/app/signatures", icon: UserRoundPen },
  { label: "Collected forms", description: "Review filled copies and form results", href: "/app/editor?view=filled", icon: Link2 },
  { label: "Combine", description: "Merge documents — implementation queued", href: "/app/editor?view=combine", icon: Files },
  { label: "Reorganize", description: "Manage document pages — implementation queued", href: "/app/editor?view=pages", icon: PanelsTopLeft },
] as const;

export default async function EditorDashboard({ searchParams }: { searchParams?: SearchParams }) {
  await requirePermission("DOCUMENT_READ");
  const q = (searchParams?.q ?? "").trim().toLowerCase();
  const docs = await prisma.document.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      author: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
      signatures: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const filtered = q ? docs.filter((d) => [d.documentId, d.title, d.type, d.author.firstName, d.author.lastName].join(" ").toLowerCase().includes(q)) : docs;
  const drafts = docs.filter((d) => d.status === "DRAFT").length;
  const waiting = docs.filter((d) => d.signatures.some((s) => ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(s.status))).length;
  const completed = docs.filter((d) => ["FINAL", "SIGNED"].includes(d.status)).length;
  const staleCutoff = Date.now() - 7 * 86_400_000;
  const actionRequired = docs.filter((d) => d.status === "DRAFT" && d.updatedAt.getTime() < staleCutoff).length;

  return (
    <div>
      <PageHeader title="Document Editor" subtitle="Dedicated workspace for editing, filling, annotating, organizing and preparing JUN documents." />

      <div className="mb-6 flex flex-wrap gap-3">
        <form method="get" className="relative min-w-[260px] flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2" />
          <input name="q" defaultValue={searchParams?.q ?? ""} placeholder="Search editor documents…" className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-electric" />
        </form>
        <Link href="/app/documents/new"><Button variant="primary">Add new</Button></Link>
        <Link href="/app/documents/templates"><Button variant="outline">Templates</Button></Link>
      </div>

      <div className="mb-7">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Recommended tools</h2><Link href="/app/editor" className="text-xs font-medium text-electric">All tools</Link></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {tools.map((tool) => <Link key={tool.label} href={tool.href}><Card className="h-full transition hover:border-electric/40 hover:shadow-sm"><CardContent className="p-4"><tool.icon className="h-6 w-6 text-electric" /><p className="mt-3 text-sm font-semibold">{tool.label}</p><p className="mt-1 text-xs text-muted2">{tool.description}</p><p className="mt-4 text-xs font-semibold text-electric">Start now</p></CardContent></Card></Link>)}
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/app/editor"><Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-4 w-4 text-electric" /><div><p className="text-xs text-muted2">Recent</p><p className="font-semibold">{docs.length}</p></div></CardContent></Card></Link>
        <Link href="/app/editor?view=action"><Card><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-4 w-4 text-amber-600" /><div><p className="text-xs text-muted2">Action required</p><p className="font-semibold">{actionRequired}</p></div></CardContent></Card></Link>
        <Link href="/app/editor?view=drafts"><Card><CardContent className="flex items-center gap-3 p-4"><FileEdit className="h-4 w-4 text-muted2" /><div><p className="text-xs text-muted2">Drafts</p><p className="font-semibold">{drafts}</p></div></CardContent></Card></Link>
        <div className="grid grid-cols-2 gap-2"><Card><CardContent className="flex items-center gap-2 p-4"><UsersRound className="h-4 w-4 text-muted2" /><div><p className="text-[11px] text-muted2">Waiting</p><p className="font-semibold">{waiting}</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-2 p-4"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><div><p className="text-[11px] text-muted2">Completed</p><p className="font-semibold">{completed}</p></div></CardContent></Card></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="grid grid-cols-[minmax(0,1fr)_180px_170px_48px] border-b border-line px-4 py-3 text-xs font-medium text-muted2"><span>Name</span><span>Last activity</span><span>Status</span><span /></div>
        {filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted2">No documents found.</div> : filtered.map((doc) => (
          <div key={doc.id} className="grid grid-cols-[minmax(0,1fr)_180px_170px_48px] items-center border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface/60">
            <div className="min-w-0"><Link href={`/app/editor/${doc.id}`} className="block truncate text-sm font-semibold hover:text-electric">{doc.title}</Link><p className="registry-id mt-0.5 text-[10px] text-muted2">{doc.documentId} · v{doc.versions[0]?.version ?? 1}</p></div>
            <div className="text-xs text-muted2">{formatDateTime(doc.updatedAt)}</div>
            <div><StatusBadge status={doc.status} /></div>
            <Link href={`/app/editor/${doc.id}`} className="rounded-md p-2 text-muted2 hover:bg-surface hover:text-night" aria-label={`Open ${doc.title}`}><MoreHorizontal className="h-4 w-4" /></Link>
          </div>
        ))}
      </div>
    </div>
  );
}
