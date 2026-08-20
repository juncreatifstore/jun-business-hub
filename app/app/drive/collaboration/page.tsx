import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDriveApprovals, type DriveCollaborationResource } from "@/lib/drive-collaboration";
import { DriveCollaborationPanel } from "@/components/app/drive-collaboration-panel";
import { reviewDriveApproval, cancelDriveApproval } from "@/services/drive-collaboration";
import { ArrowLeft, CheckCircle2, Clock3, FolderOpen, FileText, MessageSquare, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DriveCollaborationPage({ searchParams }: { searchParams: { type?: string; id?: string } }) {
  const user = await requireUser();
  if (!can(user, "FILE_READ")) redirect("/app/forbidden");
  const selectedType = searchParams.type === "File" || searchParams.type === "Folder" ? searchParams.type as DriveCollaborationResource : null;
  const selectedId = String(searchParams.id ?? "").trim();
  const [approvals, files, folders] = await Promise.all([
    getDriveApprovals(),
    prisma.file.findMany({ where: { isVault: false, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, name: true } }),
    prisma.folder.findMany({ where: { isVault: false }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, name: true } }),
  ]);
  const incoming = approvals.filter((a) => a.reviewerId === user.id && a.status === "PENDING");
  const requested = approvals.filter((a) => a.requesterId === user.id).slice(0, 20);
  const resourceIds = [...new Set(approvals.flatMap((a) => [a.requesterId, a.reviewerId]))];
  const people = resourceIds.length ? await prisma.user.findMany({ where: { id: { in: resourceIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const person = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const returnTo = selectedType && selectedId ? `/app/drive/collaboration?type=${selectedType}&id=${encodeURIComponent(selectedId)}` : "/app/drive/collaboration";

  return <div className="space-y-6 text-ink">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/app/drive" className="mb-2 inline-flex items-center gap-1 text-xs text-muted2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to Drive</Link><h1 className="flex items-center gap-2 text-2xl font-semibold"><MessageSquare className="h-6 w-6 text-electric" /> Collaboration Center</h1><p className="mt-1 text-sm text-muted2">Comments, mentions, team review and approval history.</p></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">{incoming.length} awaiting your review</span></div>

    {incoming.length ? <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4"><h2 className="mb-3 text-sm font-semibold">Awaiting your review</h2><div className="space-y-3">{incoming.map((a) => <div key={a.id} className="rounded-lg border border-line bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-sm font-medium">{a.resourceType} approval</div><div className="mt-1 text-xs text-muted2">Requested by {person.get(a.requesterId) ?? "Team member"} · {new Date(a.createdAt).toLocaleString()}</div>{a.message ? <p className="mt-2 text-sm">{a.message}</p> : null}</div><Link href={`/app/drive/collaboration?type=${a.resourceType}&id=${encodeURIComponent(a.resourceId)}`} className="text-xs text-electric hover:underline">Open thread</Link></div><div className="mt-3 grid gap-2 md:grid-cols-2"><form action={reviewDriveApproval.bind(null, a.id)} className="flex gap-2"><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="decision" value="APPROVED" /><input name="reviewNote" placeholder="Optional approval note" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-xs" /><button className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button></form><form action={reviewDriveApproval.bind(null, a.id)} className="flex gap-2"><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="decision" value="CHANGES_REQUESTED" /><input name="reviewNote" required placeholder="What should be changed?" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-xs" /><button className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 text-xs font-medium text-amber-800"><XCircle className="h-3.5 w-3.5" /> Changes</button></form></div></div>)}</div></section> : null}

    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <section className="space-y-5"><div className="rounded-xl border border-line bg-white p-4"><h2 className="mb-3 text-sm font-semibold">Recent files</h2><div className="space-y-1">{files.map((f) => <Link key={f.id} href={`/app/drive/collaboration?type=File&id=${encodeURIComponent(f.id)}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface"><FileText className="h-4 w-4 text-electric" /><span className="truncate">{f.name}</span></Link>)}</div></div><div className="rounded-xl border border-line bg-white p-4"><h2 className="mb-3 text-sm font-semibold">Recent folders</h2><div className="space-y-1">{folders.map((f) => <Link key={f.id} href={`/app/drive/collaboration?type=Folder&id=${encodeURIComponent(f.id)}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface"><FolderOpen className="h-4 w-4 text-electric" /><span className="truncate">{f.name}</span></Link>)}</div></div></section>
      <div>{selectedType && selectedId ? <DriveCollaborationPanel resourceType={selectedType} resourceId={selectedId} returnTo={returnTo} /> : <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center"><MessageSquare className="mx-auto h-8 w-8 text-muted2" /><h2 className="mt-3 font-medium">Choose a file or folder</h2><p className="mt-1 text-sm text-muted2">Open its collaboration thread to comment, mention someone or request approval.</p></div>}</div>
    </div>

    {requested.length ? <section className="rounded-xl border border-line bg-white p-4"><h2 className="mb-3 text-sm font-semibold">Your approval requests</h2><div className="divide-y divide-line">{requested.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="flex items-center gap-2 text-sm font-medium">{a.status === "PENDING" ? <Clock3 className="h-4 w-4 text-amber-600" /> : a.status === "APPROVED" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted2" />}{a.resourceType} · {a.status.replace(/_/g, " ")}</div><div className="mt-1 text-xs text-muted2">Reviewer: {person.get(a.reviewerId) ?? "Team member"} · {new Date(a.createdAt).toLocaleString()}</div></div><div className="flex items-center gap-2"><Link href={`/app/drive/collaboration?type=${a.resourceType}&id=${encodeURIComponent(a.resourceId)}`} className="text-xs text-electric hover:underline">Open</Link>{a.status === "PENDING" ? <form action={cancelDriveApproval.bind(null, a.id)}><input type="hidden" name="returnTo" value={returnTo} /><button className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">Cancel</button></form> : null}</div></div>)}</div></section> : null}
  </div>;
}
