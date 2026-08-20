"use client";

import { Copy, FileClock, History, Link2, Pencil, ShieldOff, ShieldCheck, Upload, X } from "lucide-react";
import {
  renameDriveFile,
  duplicateDriveFile,
  saveDriveFileNote,
  setDrivePublicEnabled,
  regenerateDrivePublicLink,
  uploadDriveNewVersion,
} from "@/services/drive-manage";

export type DriveVersionInfo = {
  versionId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
};

export type DriveActivityInfo = {
  id: string;
  action: string;
  createdAt: string;
  user: string;
};

const inputClass = "rounded-lg border border-line bg-white text-ink outline-none focus:border-electric";
const sectionClass = "mb-5 rounded-xl border border-line bg-white p-4";
const secondaryButton = "rounded-lg border border-line bg-white px-3 text-sm text-ink hover:bg-surface";

export function DriveFileManager({
  file,
  returnTo,
  onClose,
}: {
  file: {
    id: string;
    name: string;
    mimeType: string;
    note: string;
    publicDisabled: boolean;
    publicToken: string | null;
    versions: DriveVersionInfo[];
    activity: DriveActivityInfo[];
  };
  returnTo: string;
  onClose: () => void;
}) {
  const publicUrl = typeof window === "undefined" ? "" : `${window.location.origin}/view/file/${file.id}${file.publicToken ? `?key=${encodeURIComponent(file.publicToken)}` : ""}`;

  return (
    <div className="fixed inset-0 z-[60] bg-black/25" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-line bg-surface p-5 text-ink shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div><h2 className="text-lg font-semibold">Manage file</h2><p className="mt-1 text-xs text-muted2">Metadata, versions, activity and public-link security.</p></div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-muted2 hover:bg-white hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <section className={sectionClass}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Name & duplicate</h3>
          <form action={renameDriveFile.bind(null, file.id)} className="flex gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input name="name" defaultValue={file.name} required maxLength={200} className={`h-10 min-w-0 flex-1 px-3 text-sm ${inputClass}`} />
            <button className={secondaryButton}>Rename</button>
          </form>
          <form action={duplicateDriveFile.bind(null, file.id)} className="mt-3 flex gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input name="name" placeholder={`Copy of ${file.name}`} maxLength={200} className={`h-10 min-w-0 flex-1 px-3 text-sm ${inputClass}`} />
            <button className={`inline-flex items-center gap-2 ${secondaryButton}`}><Copy className="h-4 w-4" /> Duplicate</button>
          </form>
        </section>

        <section className={sectionClass}>
          <h3 className="mb-3 text-sm font-semibold">Internal note</h3>
          <form action={saveDriveFileNote.bind(null, file.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <textarea name="note" defaultValue={file.note} rows={4} maxLength={4000} placeholder="Internal information about this file…" className={`w-full p-3 text-sm ${inputClass}`} />
            <button className="mt-2 rounded-lg bg-electric px-3 py-2 text-sm font-medium text-white hover:opacity-90">Save note</button>
          </form>
        </section>

        <section className={sectionClass}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Public viewing link</h3>
            <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${file.publicDisabled ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{file.publicDisabled ? "DISABLED" : "ACTIVE"}</span>
          </div>
          <div className="break-all rounded-lg border border-line bg-surface p-3 text-xs text-muted2">{publicUrl || `/view/file/${file.id}`}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={file.publicDisabled} onClick={() => navigator.clipboard.writeText(publicUrl)} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink hover:bg-surface disabled:opacity-40"><Copy className="h-3.5 w-3.5" /> Copy link</button>
            <form action={setDrivePublicEnabled.bind(null, file.id)}><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="enabled" value={file.publicDisabled ? "1" : "0"} /><button className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink hover:bg-surface">{file.publicDisabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}{file.publicDisabled ? "Enable link" : "Disable link"}</button></form>
            <form action={regenerateDrivePublicLink.bind(null, file.id)} onSubmit={(e) => { if (!window.confirm("Regenerate this public link? The previous shared URL will stop working.")) e.preventDefault(); }}><input type="hidden" name="returnTo" value={returnTo} /><button className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100">Regenerate & revoke old link</button></form>
          </div>
        </section>

        <section className={sectionClass}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileClock className="h-4 w-4" /> Version history</h3>
          <form action={uploadDriveNewVersion.bind(null, file.id)} className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="file" name="file" required className={`min-w-0 flex-1 p-2 text-xs ${inputClass}`} />
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-electric px-3 text-sm font-medium text-white hover:opacity-90"><Upload className="h-4 w-4" /> Upload new version</button>
          </form>
          {file.versions.length ? <div className="space-y-2">{file.versions.map((v, index) => <div key={v.versionId} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"><div className="min-w-0"><div className="text-sm font-medium text-ink">Previous version {file.versions.length - index}</div><div className="mt-1 text-xs text-muted2">{new Date(v.createdAt).toLocaleString()} · {v.createdBy} · {(v.sizeBytes / 1024).toFixed(1)} KB</div></div><a href={`/api/files/${file.id}/versions/${encodeURIComponent(v.versionId)}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-line bg-white px-2 py-1 text-xs text-ink hover:bg-surface">Open</a></div>)}</div> : <p className="text-xs text-muted2">No previous versions yet.</p>}
        </section>

        <section className="rounded-xl border border-line bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> File activity</h3>
          {file.activity.length ? <div className="space-y-3">{file.activity.map((a) => <div key={a.id} className="border-l border-line pl-3"><div className="text-sm text-ink">{a.action.replace(/_/g, " ")}</div><div className="mt-0.5 text-xs text-muted2">{new Date(a.createdAt).toLocaleString()} · {a.user}</div></div>)}</div> : <p className="text-xs text-muted2">No activity recorded yet.</p>}
        </section>
      </aside>
    </div>
  );
}
