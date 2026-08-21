"use client";

import { useEffect, useState } from "react";
import { Copy, FileClock, History, Link2, Pencil, ShieldOff, ShieldCheck, Upload, X, QrCode, LockKeyhole, Clock3, BarChart3, Eye, Download } from "lucide-react";
import {
  renameDriveFile,
  duplicateDriveFile,
  saveDriveFileNote,
  setDrivePublicEnabled,
  regenerateDrivePublicLink,
  uploadDriveNewVersion,
} from "@/services/drive-manage";
import { saveDrivePublicSecurity } from "@/services/drive-public-security";
import { DriveIntelligencePanel } from "@/components/app/drive-intelligence-panel";
import { DriveMediaPreview } from "@/components/app/drive-media-preview";

export type DriveVersionInfo = { versionId: string; name: string; mimeType: string; sizeBytes: number; createdAt: string; createdBy: string };
export type DriveActivityInfo = { id: string; action: string; createdAt: string; user: string };
type PublicSecurityData = {
  disabled: boolean;
  expiresAt: string | null;
  passwordProtected: boolean;
  publicUrl: string;
  metrics: { views: number; opens: number; downloads: number; lastAccessAt: string | null };
  recentAccess: Array<{ id: string; action: string; createdAt: string; ip: string | null; userAgent: string | null }>;
};

const inputClass = "rounded-lg border border-line bg-white text-ink outline-none focus:border-electric";
const sectionClass = "mb-5 rounded-xl border border-line bg-white p-4";
const secondaryButton = "rounded-lg border border-line bg-white px-3 text-sm text-ink hover:bg-surface";

function localDateTime(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function DriveFileManager({ file, returnTo, onClose }: {
  file: { id: string; name: string; mimeType: string; note: string; publicDisabled: boolean; publicToken: string | null; versions: DriveVersionInfo[]; activity: DriveActivityInfo[] };
  returnTo: string;
  onClose: () => void;
}) {
  const [security, setSecurity] = useState<PublicSecurityData | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const publicUrl = security?.publicUrl || (typeof window === "undefined" ? "" : `${window.location.origin}/view/file/${file.id}${file.publicToken ? `?key=${encodeURIComponent(file.publicToken)}` : ""}`);

  useEffect(() => {
    let active = true;
    fetch(`/api/files/${file.id}/public-security`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => { if (active) setSecurity(data); })
      .catch(() => { if (active) setSecurityError(true); });
    return () => { active = false; };
  }, [file.id]);

  const disabled = security?.disabled ?? file.publicDisabled;

  return (
    <div className="fixed inset-0 z-[60] bg-black/25" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-line bg-surface p-5 text-ink shadow-2xl">
        <div className="mb-6 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Manage file</h2><p className="mt-1 text-xs text-muted2">Preview, metadata, intelligence, versions, activity and secure public sharing.</p></div><button type="button" onClick={onClose} className="rounded-md p-2 text-muted2 hover:bg-white hover:text-ink"><X className="h-5 w-5" /></button></div>

        <DriveMediaPreview fileId={file.id} name={file.name} mimeType={file.mimeType} />

        <section className={sectionClass}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Name & duplicate</h3>
          <form action={renameDriveFile.bind(null, file.id)} className="flex gap-2"><input type="hidden" name="returnTo" value={returnTo} /><input name="name" defaultValue={file.name} required maxLength={200} className={`h-10 min-w-0 flex-1 px-3 text-sm ${inputClass}`} /><button className={secondaryButton}>Rename</button></form>
          <form action={duplicateDriveFile.bind(null, file.id)} className="mt-3 flex gap-2"><input type="hidden" name="returnTo" value={returnTo} /><input name="name" placeholder={`Copy of ${file.name}`} maxLength={200} className={`h-10 min-w-0 flex-1 px-3 text-sm ${inputClass}`} /><button className={`inline-flex items-center gap-2 ${secondaryButton}`}><Copy className="h-4 w-4" /> Duplicate</button></form>
        </section>

        <section className={sectionClass}>
          <h3 className="mb-3 text-sm font-semibold">Internal note</h3>
          <form action={saveDriveFileNote.bind(null, file.id)}><input type="hidden" name="returnTo" value={returnTo} /><textarea name="note" defaultValue={file.note} rows={4} maxLength={4000} placeholder="Internal information about this file…" className={`w-full p-3 text-sm ${inputClass}`} /><button className="mt-2 rounded-lg bg-electric px-3 py-2 text-sm font-medium text-white hover:opacity-90">Save note</button></form>
        </section>

        <DriveIntelligencePanel fileId={file.id} returnTo={returnTo} />

        <section className={sectionClass}>
          <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Public viewing link</h3><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${disabled ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{disabled ? "DISABLED" : "ACTIVE"}</span></div>
          <div className="break-all rounded-lg border border-line bg-surface p-3 text-xs text-muted2">{publicUrl || `/view/file/${file.id}`}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={disabled} onClick={() => navigator.clipboard.writeText(publicUrl)} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink hover:bg-surface disabled:opacity-40"><Copy className="h-3.5 w-3.5" /> Copy link</button>
            <a href={`/api/files/${file.id}/public-qr`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink hover:bg-surface"><QrCode className="h-3.5 w-3.5" /> Download QR</a>
            <form action={setDrivePublicEnabled.bind(null, file.id)}><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="enabled" value={disabled ? "1" : "0"} /><button className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink hover:bg-surface">{disabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}{disabled ? "Enable link" : "Disable link"}</button></form>
            <form action={regenerateDrivePublicLink.bind(null, file.id)} onSubmit={(e) => { if (!window.confirm("Regenerate this public link? The previous shared URL will stop working.")) e.preventDefault(); }}><input type="hidden" name="returnTo" value={returnTo} /><button className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100">Regenerate & revoke old link</button></form>
          </div>
          <p className="mt-3 text-xs text-muted2">Every public recipient must accept the current confidentiality policy before preview or download.</p>
        </section>

        <section className={sectionClass}>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4" /> Link security</h3><p className="mb-4 text-xs text-muted2">Optional expiration and password. Password unlock lasts 30 minutes per device.</p>
          {securityError ? <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">Security metrics could not be loaded. You can still save new settings.</p> : null}
          <form action={saveDrivePublicSecurity.bind(null, file.id)} className="space-y-3"><input type="hidden" name="returnTo" value={returnTo} />
            <label className="block text-xs font-medium text-muted2"><span className="mb-1 flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Expiration date (optional)</span><input type="datetime-local" name="expiresAt" defaultValue={localDateTime(security?.expiresAt ?? null)} className={`h-10 w-full px-3 text-sm ${inputClass}`} /></label>
            <label className="block text-xs font-medium text-muted2"><span className="mb-1 flex items-center gap-1"><LockKeyhole className="h-3.5 w-3.5" /> {security?.passwordProtected ? "Replace password" : "Add password"}</span><input type="password" name="password" minLength={6} placeholder={security?.passwordProtected ? "Leave blank to keep current password" : "Minimum 6 characters"} className={`h-10 w-full px-3 text-sm ${inputClass}`} /></label>
            {security?.passwordProtected ? <label className="flex items-center gap-2 text-xs text-muted2"><input type="checkbox" name="clearPassword" value="1" /> Remove password protection</label> : null}
            <button className="rounded-lg bg-electric px-3 py-2 text-sm font-medium text-white hover:opacity-90">Save security</button>
          </form>
        </section>

        <section className={sectionClass}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4" /> Public access analytics</h3>
          {security ? <><div className="grid grid-cols-3 gap-2"><div className="rounded-lg border border-line bg-surface p-3"><Eye className="mb-1 h-4 w-4 text-electric" /><div className="text-xl font-semibold">{security.metrics.views}</div><div className="text-[11px] text-muted2">Page views</div></div><div className="rounded-lg border border-line bg-surface p-3"><FileClock className="mb-1 h-4 w-4 text-electric" /><div className="text-xl font-semibold">{security.metrics.opens}</div><div className="text-[11px] text-muted2">File opens</div></div><div className="rounded-lg border border-line bg-surface p-3"><Download className="mb-1 h-4 w-4 text-electric" /><div className="text-xl font-semibold">{security.metrics.downloads}</div><div className="text-[11px] text-muted2">Downloads</div></div></div><p className="mt-2 text-xs text-muted2">Last access: {security.metrics.lastAccessAt ? new Date(security.metrics.lastAccessAt).toLocaleString() : "Never"}</p>
          <div className="mt-4 space-y-2">{security.recentAccess.length ? security.recentAccess.map((a) => <div key={a.id} className="rounded-lg border border-line bg-surface p-2.5"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium text-ink">{a.action.replace("FILE_PUBLIC_", "")}</span><span className="text-muted2">{new Date(a.createdAt).toLocaleString()}</span></div><div className="mt-1 truncate text-[11px] text-muted2">{a.ip || "IP unavailable"} · {a.userAgent || "Browser unavailable"}</div></div>) : <p className="text-xs text-muted2">No public access recorded yet.</p>}</div></> : <p className="text-xs text-muted2">Loading public access analytics…</p>}
        </section>

        <section className={sectionClass}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileClock className="h-4 w-4" /> Version history</h3>
          <form action={uploadDriveNewVersion.bind(null, file.id)} className="mb-4 flex flex-wrap items-end gap-2"><input type="hidden" name="returnTo" value={returnTo} /><input type="file" name="file" required className={`min-w-0 flex-1 p-2 text-xs ${inputClass}`} /><button className="inline-flex h-10 items-center gap-2 rounded-lg bg-electric px-3 text-sm font-medium text-white hover:opacity-90"><Upload className="h-4 w-4" /> Upload new version</button></form>
          {file.versions.length ? <div className="space-y-2">{file.versions.map((v, index) => <div key={v.versionId} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"><div className="min-w-0"><div className="text-sm font-medium text-ink">Previous version {file.versions.length - index}</div><div className="mt-1 text-xs text-muted2">{new Date(v.createdAt).toLocaleString()} · {v.createdBy} · {(v.sizeBytes / 1024).toFixed(1)} KB</div></div><a href={`/api/files/${file.id}/versions/${encodeURIComponent(v.versionId)}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-line bg-white px-2 py-1 text-xs text-ink hover:bg-surface">Open</a></div>)}</div> : <p className="text-xs text-muted2">No previous versions yet.</p>}
        </section>

        <section className="rounded-xl border border-line bg-white p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> File activity</h3>{file.activity.length ? <div className="space-y-3">{file.activity.map((a) => <div key={a.id} className="border-l border-line pl-3"><div className="text-sm text-ink">{a.action.replace(/_/g, " ")}</div><div className="mt-0.5 text-xs text-muted2">{new Date(a.createdAt).toLocaleString()} · {a.user}</div></div>)}</div> : <p className="text-xs text-muted2">No activity recorded yet.</p>}</section>
      </aside>
    </div>
  );
}
