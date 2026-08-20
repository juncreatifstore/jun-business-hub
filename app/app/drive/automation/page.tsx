import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CheckCircle2, Clock3, GitBranch, Play, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DRIVE_AUTOMATION_LAST_SCAN, DRIVE_CATEGORIES, getDriveAutomationProposals, getExpiringDriveFiles, listDriveAutomationRules } from "@/lib/drive-automation";
import { createDriveAutomationRule, deleteDriveAutomationRule, reviewDriveAutomationProposal, runDriveAutomationScan, toggleDriveAutomationRule, clearDriveExpiry } from "@/services/drive-automation";

export const dynamic = "force-dynamic";

export default async function DriveAutomationPage() {
  const user = await requireUser();
  if (!can(user, "FILE_READ")) redirect("/app/forbidden");
  const canManage = can(user, "FILE_UPLOAD");

  const [rules, proposals, expiring, folders, teamUsers, lastScan] = await Promise.all([
    listDriveAutomationRules(),
    getDriveAutomationProposals(),
    getExpiringDriveFiles(90),
    prisma.folder.findMany({ where: { isVault: false }, orderBy: { name: "asc" }, select: { id: true, name: true, parent: { select: { name: true } } }, take: 500 }),
    prisma.user.findMany({ where: { status: "ACTIVE", role: { not: "CLIENT" } }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    prisma.appSetting.findUnique({ where: { key: DRIVE_AUTOMATION_LAST_SCAN }, select: { value: true } }),
  ]);

  const pending = proposals.filter((p) => p.status === "PENDING");
  const proposalFileIds = [...new Set(pending.map((p) => p.fileId))];
  const proposalFiles = proposalFileIds.length ? await prisma.file.findMany({ where: { id: { in: proposalFileIds } }, select: { id: true, name: true, category: true } }) : [];
  const fileMap = new Map(proposalFiles.map((f) => [f.id, f]));

  return <div className="space-y-6 text-ink">
    <PageHeader title="Drive Automation" subtitle="Rules, post-upload workflows, human approvals and document expiration monitoring." />

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
      <div><div className="flex items-center gap-2 text-sm font-semibold"><GitBranch className="h-4 w-4 text-electric" /> Automation engine</div><p className="mt-1 text-xs text-muted2">New uploads are evaluated automatically. Sensitive metadata changes remain approval-based.</p><p className="mt-1 text-[11px] text-muted2">Last scan: {lastScan?.value ? new Date(lastScan.value).toLocaleString() : "Never"}</p></div>
      <div className="flex gap-2"><Link href="/app/drive" className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-3 text-sm hover:bg-surface">Back to Drive</Link>{canManage ? <form action={runDriveAutomationScan}><Button type="submit" variant="primary"><Play className="mr-2 h-4 w-4" /> Run scan</Button></form> : null}</div>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardContent className="pt-5"><div className="text-2xl font-semibold">{rules.filter((r) => r.enabled).length}</div><p className="text-xs text-muted2">Active rules</p></CardContent></Card>
      <Card><CardContent className="pt-5"><div className="text-2xl font-semibold">{pending.length}</div><p className="text-xs text-muted2">Pending approvals</p></CardContent></Card>
      <Card><CardContent className="pt-5"><div className="text-2xl font-semibold">{expiring.length}</div><p className="text-xs text-muted2">Expiring / dated within 90 days</p></CardContent></Card>
    </div>

    {canManage ? <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Create automation rule</CardTitle></CardHeader>
      <CardContent><form action={createDriveAutomationRule} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <input type="hidden" name="returnTo" value="/app/drive/automation" />
        <label className="text-xs text-muted2">Rule name<input name="name" required maxLength={120} placeholder="Visa review workflow" className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" /></label>
        <label className="text-xs text-muted2">Match category<select name="matchCategory" defaultValue="" className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"><option value="">Any category</option>{DRIVE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}</select></label>
        <label className="text-xs text-muted2">Filename contains<input name="filenameContains" placeholder="visa, passport, receipt…" className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" /></label>
        <label className="text-xs text-muted2">MIME prefix<input name="mimePrefix" placeholder="application/pdf" className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" /></label>
        <label className="text-xs text-muted2">Add tags<input name="tags" placeholder="visa, review, priority" className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" /></label>
        <label className="text-xs text-muted2">Suggest category<select name="suggestCategory" defaultValue="" className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"><option value="">No category suggestion</option>{DRIVE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}</select></label>
        <label className="text-xs text-muted2">Move to folder<select name="moveToFolderId" defaultValue="" className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"><option value="">Do not move</option><option value="__ROOT__">My Drive root</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.parent ? `${f.parent.name} / ${f.name}` : f.name}</option>)}</select></label>
        <label className="text-xs text-muted2">Notify user IDs<input name="notifyUserIds" placeholder={teamUsers.slice(0, 2).map((u) => u.id).join(", ")} className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" /><span className="mt-1 block text-[10px]">Comma-separated internal IDs.</span></label>
        <label className="text-xs text-muted2">Task assignee<select name="taskAssigneeId" defaultValue="" className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"><option value="">Unassigned</option>{teamUsers.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</select></label>
        <label className="text-xs text-muted2">Task due in days<input name="taskDueDays" type="number" min={0} max={365} defaultValue={2} className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" /></label>
        <div className="flex flex-wrap items-center gap-5 md:col-span-2 xl:col-span-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="createTask" value="1" /> Create review task</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requireApproval" value="1" defaultChecked /> Require approval for move</label><Button type="submit" variant="primary"><Plus className="mr-2 h-4 w-4" /> Create rule</Button></div>
      </form></CardContent>
    </Card> : null}

    <Card><CardHeader><CardTitle>Automation rules</CardTitle></CardHeader><CardContent>{rules.length ? <div className="space-y-3">{rules.map((rule) => <div key={rule.id} className="rounded-xl border border-line bg-surface p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-medium">{rule.name}</span><Badge className={rule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}>{rule.enabled ? "ACTIVE" : "PAUSED"}</Badge></div><p className="mt-2 text-xs text-muted2">Match: {rule.match.categories?.join(", ") || "any category"}{rule.match.filenameContains ? ` · name contains “${rule.match.filenameContains}”` : ""}{rule.match.mimePrefix ? ` · ${rule.match.mimePrefix}` : ""}</p><p className="mt-1 text-xs text-muted2">Actions: {rule.actions.addTags?.length ? `tags ${rule.actions.addTags.join(", ")}` : ""}{rule.actions.suggestCategory ? ` · suggest ${rule.actions.suggestCategory}` : ""}{rule.actions.createTask ? " · create task" : ""}{rule.actions.notifyUserIds?.length ? ` · notify ${rule.actions.notifyUserIds.length}` : ""}{rule.actions.moveToFolderId !== undefined ? " · move file" : ""}</p></div>{canManage ? <div className="flex gap-2"><form action={toggleDriveAutomationRule.bind(null, rule.id)}><input type="hidden" name="returnTo" value="/app/drive/automation" /><button className="rounded-lg border border-line bg-white px-3 py-2 text-xs hover:bg-surface">{rule.enabled ? "Pause" : "Enable"}</button></form><form action={deleteDriveAutomationRule.bind(null, rule.id)}><input type="hidden" name="returnTo" value="/app/drive/automation" /><button className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Delete</button></form></div> : null}</div></div>)}</div> : <p className="text-sm text-muted2">No automation rules yet.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Human approval queue</CardTitle></CardHeader><CardContent>{pending.length ? <div className="space-y-3">{pending.slice(0, 100).map((p) => { const f = fileMap.get(p.fileId); return <div key={p.id} className="rounded-xl border border-line bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{p.label}</p><p className="mt-1 text-xs text-muted2">{f?.name ?? "File"} · {p.type.replaceAll("_", " ")} · {new Date(p.createdAt).toLocaleString()}</p></div>{canManage ? <div className="flex gap-2"><form action={reviewDriveAutomationProposal.bind(null, p.id)}><input type="hidden" name="returnTo" value="/app/drive/automation" /><input type="hidden" name="decision" value="APPROVED" /><button className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve</button></form><form action={reviewDriveAutomationProposal.bind(null, p.id)}><input type="hidden" name="returnTo" value="/app/drive/automation" /><input type="hidden" name="decision" value="REJECTED" /><button className="inline-flex items-center rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"><XCircle className="mr-1 h-3.5 w-3.5" />Reject</button></form></div> : null}</div></div>; })}</div> : <p className="text-sm text-muted2">No pending proposals.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Expiration monitoring</CardTitle></CardHeader><CardContent>{expiring.length ? <div className="space-y-2">{expiring.map((item) => item.file ? <div key={item.fileId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"><div><p className="text-sm font-medium">{item.file.name}</p><p className={`mt-1 text-xs ${item.time < Date.now() ? "text-red-700" : "text-muted2"}`}><Clock3 className="mr-1 inline h-3.5 w-3.5" />{item.time < Date.now() ? "Expired" : "Due"} {new Date(item.expiresAt).toLocaleDateString()} · {item.file.category.replaceAll("_", " ")}</p></div>{canManage ? <form action={clearDriveExpiry.bind(null, item.fileId)}><input type="hidden" name="returnTo" value="/app/drive/automation" /><button className="rounded-lg border border-line bg-white px-3 py-2 text-xs hover:bg-surface">Clear date</button></form> : null}</div> : null)}</div> : <p className="text-sm text-muted2">No monitored document expires in the next 90 days.</p>}</CardContent></Card>
  </div>;
}
