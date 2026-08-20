"use client";

import { useEffect, useState } from "react";
import { MessageSquare, AtSign, CheckCircle2, Clock3, RefreshCcw, UserCheck } from "lucide-react";
import { addDriveComment, requestDriveApproval } from "@/services/drive-collaboration";

type ResourceType = "File" | "Folder";
type TeamUser = { id: string; firstName: string; lastName: string; email: string };
type Comment = { id: string; body: string; createdAt: string; author: TeamUser | null; mentionedUsers: TeamUser[] };
type Approval = { id: string; reviewerId: string; requesterId: string; message: string; status: string; createdAt: string; reviewedAt?: string; reviewNote?: string };
type Snapshot = { currentUserId: string; comments: Comment[]; approvals: Approval[]; teamUsers: TeamUser[] };

const box = "mb-5 rounded-xl border border-line bg-white p-4";
const input = "rounded-lg border border-line bg-white text-ink outline-none focus:border-electric";

export function DriveCollaborationPanel({ resourceType, resourceId, returnTo }: { resourceType: ResourceType; resourceId: string; returnTo: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [mentionIds, setMentionIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setError(false);
    fetch(`/api/drive/collaboration/${resourceType}/${resourceId}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((value) => { if (active) setData(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [resourceType, resourceId]);

  const others = data?.teamUsers.filter((u) => u.id !== data.currentUserId) ?? [];
  return <section className={box}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Collaboration</h3><p className="mt-1 text-xs text-muted2">Internal comments, mentions and approval requests.</p></div>
      <button type="button" onClick={() => window.location.reload()} className="rounded-md p-2 text-muted2 hover:bg-surface" title="Refresh"><RefreshCcw className="h-4 w-4" /></button>
    </div>
    {error ? <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">Collaboration data could not be loaded.</p> : null}

    <form action={addDriveComment.bind(null, resourceType, resourceId)} className="space-y-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="mentionUserIds" value={mentionIds.join(",")} />
      <textarea name="body" required maxLength={4000} rows={3} placeholder="Write an internal comment…" className={`w-full p-3 text-sm ${input}`} />
      {others.length ? <div><div className="mb-1 flex items-center gap-1 text-[11px] text-muted2"><AtSign className="h-3.5 w-3.5" /> Mention team members</div><div className="flex flex-wrap gap-1.5">{others.map((u) => { const active = mentionIds.includes(u.id); return <button key={u.id} type="button" onClick={() => setMentionIds((prev) => active ? prev.filter((id) => id !== u.id) : [...prev, u.id])} className={`rounded-full border px-2 py-1 text-[11px] ${active ? "border-blue-300 bg-blue-50 text-blue-800" : "border-line bg-white text-muted2"}`}>@{u.firstName}</button>; })}</div></div> : null}
      <button className="rounded-lg bg-electric px-3 py-2 text-sm font-medium text-white">Add comment</button>
    </form>

    <div className="mt-4 space-y-2">
      {data?.comments.length ? data.comments.map((c) => <div key={c.id} className="rounded-lg border border-line bg-surface p-3"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium text-ink">{c.author ? `${c.author.firstName} ${c.author.lastName}` : "Unknown user"}</span><span className="text-muted2">{new Date(c.createdAt).toLocaleString()}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-ink">{c.body}</p>{c.mentionedUsers.length ? <div className="mt-2 text-[11px] text-blue-700">Mentions: {c.mentionedUsers.map((u) => `@${u.firstName}`).join(", ")}</div> : null}</div>) : <p className="text-xs text-muted2">No comments yet.</p>}
    </div>

    <div className="my-4 border-t border-line" />
    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><UserCheck className="h-4 w-4" /> Request approval</h4>
    <form action={requestDriveApproval.bind(null, resourceType, resourceId)} className="space-y-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      <select name="reviewerId" required defaultValue="" className={`h-10 w-full px-3 text-sm ${input}`}><option value="" disabled>Choose reviewer</option>{others.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</select>
      <textarea name="message" maxLength={2000} rows={2} placeholder="What should the reviewer verify?" className={`w-full p-3 text-sm ${input}`} />
      <button className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-surface">Send for approval</button>
    </form>

    <div className="mt-4 space-y-2">{data?.approvals.length ? data.approvals.map((a) => <div key={a.id} className="rounded-lg border border-line bg-surface p-3 text-xs"><div className="flex items-center justify-between"><span className="font-medium text-ink">{a.status === "APPROVED" ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> APPROVED</span> : <span className="inline-flex items-center gap-1 text-amber-700"><Clock3 className="h-3.5 w-3.5" /> {a.status.replace(/_/g, " ")}</span>}</span><span className="text-muted2">{new Date(a.createdAt).toLocaleString()}</span></div>{a.message ? <p className="mt-2 text-muted2">{a.message}</p> : null}{a.reviewNote ? <p className="mt-2 rounded-md bg-white p-2 text-ink">Review: {a.reviewNote}</p> : null}</div>) : null}</div>
  </section>;
}
