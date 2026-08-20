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
    <div className="fixed inset-0 z-[60] bg-black/55" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-night p-5 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div><h2 className="text-lg font-semibold">Manage file</h2><p className="mt-1 text-xs text-white/40">Metadata, versions, activity and public-link security.</p></div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-white/50 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <section className="mb-5 rounded-xl border border-white/10 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Name & duplicate</h3>
          <form action={renameDriveFile.bind(null, file.id)} className="flex gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input name="name" defaultValue={file.name} required maxLength={200} className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm" />
            <button className="rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15">Rename</button>
          </form>
          <form action={duplicateDriveFile.bind(null, file.id)} className="mt-3 flex gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input name="name" placeholder={`Copy of ${file.name}`} maxLength={200} className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm" />
            <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 text-sm hover:bg-white/5"><Copy className="h-4 w-4" /> Duplicate</button>
          </form>
        </section>

        <section className="mb-5 rounded-xl border border-white/10 p-4">
          <h3 className="mb-3 text-sm font-semibold">Internal note</h3>
          <form action={saveDriveFileNote.bind(null, file.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <textarea name="note" defaultValue={file.note} rows={4} maxLength={4000} placeholder="Internal information about this file…" className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm" />
            <button className="mt-2 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">Save note</button>
          </form>
        </section>

        <section className="mb-5 rounded-xl border border-white/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Public viewing link</h3>
            <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${file.publicDisabled ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{file.publicDisabled ? "DISABLED" : "ACTIVE"}</span>
          </div>
          <div className="break-all rounded-lg bg-white/[0.035] p-3 text-xs text-white/55">{publicUrl || `/view/file/${file.id}`}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={file.publicDisabled} onClick={() => navigator.clipboard.writeText(publicUrl)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40"><Copy className="h-3.5 w-3.5" /> Copy link</button>
            <form action={setDrivePublicEnabled.bind(null, file.id)}><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="enabled" value={file.publicDisabled ? "1" : "0"} /><button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs">{file.publicDisabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}{file.publicDisabled ? "Enable link" : "Disable link"}</button></form>
            <form action={regenerateDrivePublicLink.bind(null, file.id)} onSubmit={(e) => { if (!window.confirm("Regenerate this public link? The previous shared URL will stop working.")) e.preventDefault(); }}><input type="hidden" name="returnTo" value={returnTo} /><button className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Regenerate & revoke old link</button></form>
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-white/10 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileClock className="h-4 w-4" /> Version history</h3>
          <form action={uploadDriveNewVersion.bind(null, file.id)} className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="file" name="file" required className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 p-2 text-xs" />
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-electric px-3 text-sm font-medium text-night"><Upload className="h-4 w-4" /> Upload new version</button>
          </form>
          {file.versions.length ? <div className="space-y-2">{file.versions.map((v, index) => <div key={v.versionId} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] p-3"><div className="min-w-0"><div className="text-sm font-medium">Previous version {file.versions.length - index}</div><div className="mt-1 text-xs text-white/40">{new Date(v.createdAt).toLocaleString()} · {v.createdBy} · {(v.sizeBytes / 1024).toFixed(1)} KB</div></div><a href={`/api/files/${file.id}/versions/${encodeURIComponent(v.versionId)}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs">Open</a></div>)}</div> : <p className="text-xs text-white/40">No previous versions yet.</p>}
        </section>

        <section className="rounded-xl border border-white/10 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> File activity</h3>
          {file.activity.length ? <div className="space-y-3">{file.activity.map((a) => <div key={a.id} className="border-l border-white/10 pl-3"><div className="text-sm">{a.action.replace(/_/g, " ")}</div><div className="mt-0.5 text-xs text-white/40">{new Date(a.createdAt).toLocaleString()} · {a.user}</div></div>)}</div> : <p className="text-xs text-white/40">No activity recorded yet.</p>}
        </section>
      </aside>
    </div>
  );
}
