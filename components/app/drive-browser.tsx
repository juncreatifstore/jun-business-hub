"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Grid2X2, List as ListIcon, ArrowUpDown, Eye, Info, Download, Star, Share2,
  Trash2, RotateCcw, FolderOpen, FileText, X, Move, CheckSquare, Square, Link2, Settings2,
} from "lucide-react";
import { toggleFavorite, shareFile, deleteFile, restoreFile, permanentlyDeleteFile } from "@/services/files";
import { moveFiles, trashFiles, restoreFiles, permanentlyDeleteFiles } from "@/services/drive-bulk";
import { DriveFileManager, type DriveVersionInfo, type DriveActivityInfo } from "@/components/app/drive-file-manager";

type DriveView = "my" | "recent" | "starred" | "shared" | "trash";
export type DriveBrowserFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  createdAt: string;
  uploadedBy: string;
  clientLabel: string | null;
  caseNumber: string | null;
  starred: boolean;
  note: string;
  publicDisabled: boolean;
  publicToken: string | null;
  versions: DriveVersionInfo[];
  activity: DriveActivityInfo[];
};
export type DriveBrowserFolder = { id: string; name: string; files: number; children: number };
export type DriveMoveFolder = { id: string; label: string };
export type DriveTeamUser = { id: string; label: string };

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(new Date(value));
}

const subtleButton = "rounded-md p-1.5 text-muted2 transition hover:bg-surface hover:text-ink";
const selectClass = "rounded-md border border-line bg-white text-ink outline-none focus:border-electric";

export function DriveBrowser({ files, folders, moveFolders, teamUsers, view, returnTo, canDelete, canManage }: {
  files: DriveBrowserFile[];
  folders: DriveBrowserFolder[];
  moveFolders: DriveMoveFolder[];
  teamUsers: DriveTeamUser[];
  view: DriveView;
  returnTo: string;
  canDelete: boolean;
  canManage: boolean;
}) {
  const [layout, setLayout] = useState<"grid" | "list">("list");
  const [sort, setSort] = useState<"date" | "name" | "size" | "category">("date");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<DriveBrowserFile | null>(null);
  const [details, setDetails] = useState<DriveBrowserFile | null>(null);
  const [manage, setManage] = useState<DriveBrowserFile | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const saved = window.localStorage.getItem("jun:drive-layout");
    if (saved === "grid" || saved === "list") setLayout(saved);
  }, []);

  function chooseLayout(value: "grid" | "list") {
    setLayout(value);
    try { window.localStorage.setItem("jun:drive-layout", value); } catch {}
  }

  const sorted = useMemo(() => {
    const result = [...files];
    result.sort((a, b) => {
      let value = 0;
      if (sort === "name") value = a.name.localeCompare(b.name);
      else if (sort === "size") value = a.sizeBytes - b.sizeBytes;
      else if (sort === "category") value = a.category.localeCompare(b.category);
      else value = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return direction === "asc" ? value : -value;
    });
    return result;
  }, [files, sort, direction]);

  const selectedIds = [...selected];
  const allSelected = sorted.length > 0 && sorted.every((f) => selected.has(f.id));
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(sorted.map((f) => f.id))); }

  function moveDragged(folderId: string) {
    if (!draggedId || pending) return;
    const fd = new FormData();
    fd.set("fileIds", JSON.stringify([draggedId]));
    fd.set("folderId", folderId);
    fd.set("returnTo", returnTo);
    startTransition(() => moveFiles(fd));
    setDraggedId(null);
  }

  function publicUrl(file: DriveBrowserFile) {
    const suffix = file.publicToken ? `?key=${encodeURIComponent(file.publicToken)}` : "";
    return `${window.location.origin}/view/file/${file.id}${suffix}`;
  }

  function copyPublic(file: DriveBrowserFile) {
    if (file.publicDisabled) { window.alert("This public link is disabled. Enable it from Manage file first."); return; }
    navigator.clipboard.writeText(publicUrl(file)).then(() => window.alert("Public link copied"));
  }

  const bulkJson = JSON.stringify(selectedIds);

  return (
    <div className="text-ink">
      {view === "my" && folders.length ? (
        <section className="mb-7">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted2">Folders</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((folder) => (
              <Link
                key={folder.id}
                href={`/app/drive?folder=${encodeURIComponent(folder.id)}`}
                onDragOver={(e) => { if (draggedId) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); moveDragged(folder.id); }}
                className={`group rounded-xl border p-4 transition ${draggedId ? "border-electric bg-blue-50" : "border-line bg-white hover:border-electric/50 hover:bg-surface"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-electric"><FolderOpen className="h-5 w-5" /></div>
                  <div className="min-w-0"><div className="truncate font-medium group-hover:text-electric">{folder.name}</div><div className="mt-0.5 text-xs text-muted2">{folder.children} folders · {folder.files} files</div></div>
                </div>
              </Link>
            ))}
          </div>
          {draggedId ? <p className="mt-2 text-xs text-electric">Drop the file on a folder to move it.</p> : null}
        </section>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleAll} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs text-muted2 hover:bg-surface hover:text-ink">{allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />} Select all</button>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`h-9 px-2 text-xs ${selectClass}`}><option value="date">Date</option><option value="name">Name</option><option value="size">Size</option><option value="category">Category</option></select>
          <button type="button" onClick={() => setDirection((d) => d === "asc" ? "desc" : "asc")} className="rounded-lg border border-line bg-white p-2 text-muted2 hover:bg-surface hover:text-ink" title="Reverse sort"><ArrowUpDown className="h-4 w-4" /></button>
        </div>
        <div className="flex rounded-lg border border-line bg-white p-1">
          <button type="button" onClick={() => chooseLayout("list")} className={`rounded-md p-1.5 ${layout === "list" ? "bg-surface text-ink" : "text-muted2 hover:text-ink"}`} title="List view"><ListIcon className="h-4 w-4" /></button>
          <button type="button" onClick={() => chooseLayout("grid")} className={`rounded-md p-1.5 ${layout === "grid" ? "bg-surface text-ink" : "text-muted2 hover:text-ink"}`} title="Grid view"><Grid2X2 className="h-4 w-4" /></button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
          <span className="mr-1 text-sm font-medium text-electric">{selected.size} selected</span>
          {view !== "trash" ? <form action={moveFiles} className="flex items-center gap-2"><input type="hidden" name="fileIds" value={bulkJson} /><input type="hidden" name="returnTo" value={returnTo} /><select name="folderId" defaultValue="" className={`h-8 px-2 text-xs ${selectClass}`}><option value="">My Drive</option>{moveFolders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select><button className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-white px-2.5 text-xs hover:bg-surface"><Move className="h-3.5 w-3.5" /> Move</button></form> : null}
          {canDelete && view !== "trash" ? <form action={trashFiles}><input type="hidden" name="fileIds" value={bulkJson} /><input type="hidden" name="returnTo" value={returnTo} /><button className="inline-flex h-8 items-center gap-1 rounded-md bg-red-50 px-2.5 text-xs text-red-700 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /> Trash</button></form> : null}
          {canDelete && view === "trash" ? <form action={restoreFiles}><input type="hidden" name="fileIds" value={bulkJson} /><input type="hidden" name="returnTo" value={returnTo} /><button className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-white px-2.5 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Restore</button></form> : null}
          {canDelete && view === "trash" ? <form action={permanentlyDeleteFiles} onSubmit={(e) => { if (!window.confirm("Permanently delete selected files? This cannot be undone.")) e.preventDefault(); }}><input type="hidden" name="fileIds" value={bulkJson} /><input type="hidden" name="returnTo" value={returnTo} /><button className="inline-flex h-8 items-center gap-1 rounded-md bg-red-50 px-2.5 text-xs text-red-700 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /> Delete permanently</button></form> : null}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto rounded-md p-1.5 text-muted2 hover:bg-white hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      {layout === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sorted.map((f) => (
            <article key={f.id} draggable={view !== "trash"} onDragStart={() => setDraggedId(f.id)} onDragEnd={() => setDraggedId(null)} className={`rounded-xl border p-4 transition ${selected.has(f.id) ? "border-electric bg-blue-50" : "border-line bg-white hover:bg-surface"}`}>
              <div className="mb-4 flex items-start justify-between gap-2"><button type="button" onClick={() => toggle(f.id)} className="text-muted2 hover:text-ink">{selected.has(f.id) ? <CheckSquare className="h-4 w-4 text-electric" /> : <Square className="h-4 w-4" />}</button><span className="rounded-md bg-surface px-2 py-1 text-[10px] text-muted2">{f.category.replace(/_/g, " ")}</span></div>
              <button type="button" onDoubleClick={() => setPreview(f)} onClick={() => setDetails(f)} className="block w-full text-left"><FileText className="mb-3 h-9 w-9 text-electric" /><div className="truncate font-medium text-ink">{f.name}</div><div className="mt-1 text-xs text-muted2">{humanSize(f.sizeBytes)} · {formatDate(f.createdAt)}</div></button>
              <FileActions file={f} view={view} returnTo={returnTo} teamUsers={teamUsers} canDelete={canDelete} onPreview={() => setPreview(f)} onDetails={() => setDetails(f)} onCopy={() => copyPublic(f)} />
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted2"><tr><th className="w-10 p-3"></th><th className="p-3">Name</th><th className="p-3">Category</th><th className="p-3">Linked to</th><th className="p-3">Size</th><th className="p-3">Uploaded</th><th className="p-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-line">
              {sorted.map((f) => <tr key={f.id} draggable={view !== "trash"} onDragStart={() => setDraggedId(f.id)} onDragEnd={() => setDraggedId(null)} className={selected.has(f.id) ? "bg-blue-50" : "hover:bg-surface"}>
                <td className="p-3"><button type="button" onClick={() => toggle(f.id)} className="text-muted2 hover:text-ink">{selected.has(f.id) ? <CheckSquare className="h-4 w-4 text-electric" /> : <Square className="h-4 w-4" />}</button></td>
                <td className="p-3"><button type="button" onClick={() => setDetails(f)} onDoubleClick={() => setPreview(f)} className="flex max-w-[340px] items-center gap-2 text-left font-medium text-ink hover:text-electric"><FileText className="h-4 w-4 shrink-0 text-muted2" /><span className="truncate">{f.name}</span></button><div className="ml-6 text-xs text-muted2">{f.mimeType}</div></td>
                <td className="p-3 text-muted2">{f.category.replace(/_/g, " ")}</td><td className="p-3 text-muted2">{[f.clientLabel, f.caseNumber].filter(Boolean).join(" · ") || "—"}</td><td className="p-3 text-muted2">{humanSize(f.sizeBytes)}</td><td className="p-3 text-muted2">{formatDate(f.createdAt)}<div className="text-xs">{f.uploadedBy}</div></td>
                <td className="p-3"><FileActions file={f} view={view} returnTo={returnTo} teamUsers={teamUsers} canDelete={canDelete} onPreview={() => setPreview(f)} onDetails={() => setDetails(f)} onCopy={() => copyPublic(f)} /></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}

      {preview ? <PreviewModal file={preview} onClose={() => setPreview(null)} /> : null}
      {details ? <DetailsPanel file={details} canManage={canManage && view !== "trash"} onClose={() => setDetails(null)} onPreview={() => { setPreview(details); setDetails(null); }} onCopy={() => copyPublic(details)} onManage={() => { setManage(details); setDetails(null); }} /> : null}
      {manage ? <DriveFileManager file={manage} returnTo={returnTo} onClose={() => setManage(null)} /> : null}
      {pending ? <div className="fixed bottom-5 right-5 rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink shadow-xl">Moving file…</div> : null}
    </div>
  );
}

function FileActions({ file, view, returnTo, teamUsers, canDelete, onPreview, onDetails, onCopy }: { file: DriveBrowserFile; view: DriveView; returnTo: string; teamUsers: DriveTeamUser[]; canDelete: boolean; onPreview: () => void; onDetails: () => void; onCopy: () => void }) {
  return <div className="mt-3 flex flex-wrap items-center gap-1">
    {view !== "trash" ? <button type="button" onClick={onPreview} title="Preview" className={subtleButton}><Eye className="h-4 w-4" /></button> : null}
    <button type="button" onClick={onDetails} title="Details" className={subtleButton}><Info className="h-4 w-4" /></button>
    {view !== "trash" ? <button type="button" onClick={onCopy} title={file.publicDisabled ? "Public link disabled" : "Copy public link"} className={`rounded-md p-1.5 hover:bg-surface ${file.publicDisabled ? "text-red-400" : "text-muted2 hover:text-ink"}`}><Link2 className="h-4 w-4" /></button> : null}
    {view !== "trash" ? <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" title="Open file" className={subtleButton}><Download className="h-4 w-4" /></a> : null}
    {view !== "trash" ? <form action={toggleFavorite.bind(null, file.id)}><input type="hidden" name="returnTo" value={returnTo} /><button title={file.starred ? "Unstar" : "Star"} className={`rounded-md p-1.5 hover:bg-surface ${file.starred ? "text-amber-500" : "text-muted2 hover:text-ink"}`}><Star className={`h-4 w-4 ${file.starred ? "fill-current" : ""}`} /></button></form> : null}
    {view !== "trash" && teamUsers.length ? <form action={shareFile.bind(null, file.id)} className="flex items-center"><input type="hidden" name="returnTo" value={returnTo} /><select name="userId" required defaultValue="" className={`h-7 max-w-28 px-1 text-[10px] ${selectClass}`}><option value="" disabled>Share…</option>{teamUsers.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select><button title="Share" className={subtleButton}><Share2 className="h-4 w-4" /></button></form> : null}
    {view !== "trash" && canDelete ? <form action={deleteFile.bind(null, file.id)}><input type="hidden" name="returnTo" value={returnTo} /><button title="Move to Trash" className="rounded-md p-1.5 text-muted2 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></form> : null}
    {view === "trash" && canDelete ? <form action={restoreFile.bind(null, file.id)}><input type="hidden" name="returnTo" value={returnTo} /><button title="Restore" className={subtleButton}><RotateCcw className="h-4 w-4" /></button></form> : null}
    {view === "trash" && canDelete ? <form action={permanentlyDeleteFile.bind(null, file.id)} onSubmit={(e) => { if (!window.confirm("Permanently delete this file?")) e.preventDefault(); }}><input type="hidden" name="returnTo" value={returnTo} /><button title="Delete permanently" className="rounded-md p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></form> : null}
  </div>;
}

function PreviewModal({ file, onClose }: { file: DriveBrowserFile; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-line px-4 py-3"><div className="min-w-0"><div className="truncate font-medium text-ink">{file.name}</div><div className="text-xs text-muted2">{file.mimeType} · {humanSize(file.sizeBytes)}</div></div><button onClick={onClose} className="rounded-md p-2 text-muted2 hover:bg-surface hover:text-ink"><X className="h-5 w-5" /></button></div><iframe src={`/api/files/${file.id}`} title={file.name} className="min-h-0 flex-1 bg-white" /></div></div>;
}

function DetailsPanel({ file, canManage, onClose, onPreview, onCopy, onManage }: { file: DriveBrowserFile; canManage: boolean; onClose: () => void; onPreview: () => void; onCopy: () => void; onManage: () => void }) {
  return <div className="fixed inset-0 z-40 bg-black/25" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><aside className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-line bg-white p-5 text-ink shadow-2xl">
    <div className="mb-6 flex items-center justify-between"><h3 className="font-semibold">File details</h3><button onClick={onClose} className="rounded-md p-2 text-muted2 hover:bg-surface hover:text-ink"><X className="h-5 w-5" /></button></div>
    <div className="mb-5 flex h-32 items-center justify-center rounded-xl border border-line bg-surface"><FileText className="h-14 w-14 text-electric" /></div>
    <h4 className="break-words font-medium">{file.name}</h4>
    <dl className="mt-5 grid grid-cols-[110px_1fr] gap-y-3 text-sm"><dt className="text-muted2">Type</dt><dd>{file.mimeType}</dd><dt className="text-muted2">Category</dt><dd>{file.category.replace(/_/g, " ")}</dd><dt className="text-muted2">Size</dt><dd>{humanSize(file.sizeBytes)}</dd><dt className="text-muted2">Uploaded</dt><dd>{formatDate(file.createdAt)}</dd><dt className="text-muted2">Uploaded by</dt><dd>{file.uploadedBy}</dd><dt className="text-muted2">Client</dt><dd>{file.clientLabel || "—"}</dd><dt className="text-muted2">Case</dt><dd>{file.caseNumber || "—"}</dd><dt className="text-muted2">Public link</dt><dd className={file.publicDisabled ? "text-red-600" : "text-emerald-700"}>{file.publicDisabled ? "Disabled" : "Active"}</dd><dt className="text-muted2">Versions</dt><dd>{file.versions.length}</dd></dl>
    {file.note ? <div className="mt-5 rounded-lg border border-line bg-surface p-3"><div className="mb-1 text-xs font-medium text-muted2">Internal note</div><p className="whitespace-pre-wrap text-sm text-ink">{file.note}</p></div> : null}
    <div className="mt-6 flex flex-wrap gap-2"><button onClick={onPreview} className="inline-flex h-9 items-center gap-2 rounded-lg bg-electric px-3 text-sm font-medium text-white"><Eye className="h-4 w-4" /> Preview</button><button onClick={onCopy} disabled={file.publicDisabled} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm disabled:opacity-40"><Link2 className="h-4 w-4" /> Public link</button>{canManage ? <button onClick={onManage} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm hover:bg-surface"><Settings2 className="h-4 w-4" /> Manage</button> : null}</div>
  </aside></div>;
}
