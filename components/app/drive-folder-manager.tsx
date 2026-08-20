"use client";

import { X, Pencil, Move, Share2, Trash2, RotateCcw, FolderOpen, UserMinus } from "lucide-react";
import {
  renameDriveFolder,
  moveDriveFolder,
  shareDriveFolder,
  unshareDriveFolder,
  trashDriveFolder,
  restoreDriveFolder,
  permanentlyDeleteDriveFolder,
} from "@/services/drive-folders";

export type DriveFolderShare = { userId: string; label: string };
export type DriveFolderManagerFolder = {
  id: string;
  name: string;
  parentId: string | null;
  files: number;
  children: number;
  trashed: boolean;
  sharedWith: DriveFolderShare[];
};

const inputClass = "rounded-lg border border-line bg-white text-ink outline-none focus:border-electric";
const sectionClass = "mb-5 rounded-xl border border-line bg-white p-4";

export function DriveFolderManager({ folder, returnTo, moveFolders, teamUsers, canDelete, onClose }: {
  folder: DriveFolderManagerFolder;
  returnTo: string;
  moveFolders: Array<{ id: string; label: string }>;
  teamUsers: Array<{ id: string; label: string }>;
  canDelete: boolean;
  onClose: () => void;
}) {
  const validMoveFolders = moveFolders.filter((f) => f.id !== folder.id);
  return (
    <div className="fixed inset-0 z-[65] bg-black/25" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-line bg-surface p-5 text-ink shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div><h2 className="flex items-center gap-2 text-lg font-semibold"><FolderOpen className="h-5 w-5 text-electric" /> Manage folder</h2><p className="mt-1 text-xs text-muted2">Folder lifecycle, location and inherited team sharing.</p></div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-muted2 hover:bg-white hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <section className={sectionClass}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Rename</h3>
          <form action={renameDriveFolder.bind(null, folder.id)} className="flex gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input name="name" required maxLength={120} defaultValue={folder.name} className={`h-10 min-w-0 flex-1 px-3 text-sm ${inputClass}`} />
            <button className="rounded-lg border border-line bg-white px-3 text-sm hover:bg-surface">Rename</button>
          </form>
        </section>

        {!folder.trashed ? <section className={sectionClass}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Move className="h-4 w-4" /> Move folder</h3>
          <form action={moveDriveFolder.bind(null, folder.id)} className="flex gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <select name="parentId" defaultValue={folder.parentId ?? ""} className={`h-10 min-w-0 flex-1 px-3 text-sm ${inputClass}`}>
              <option value="">My Drive</option>
              {validMoveFolders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <button className="rounded-lg border border-line bg-white px-3 text-sm hover:bg-surface">Move</button>
          </form>
          <p className="mt-2 text-xs text-muted2">A folder cannot be moved inside itself or one of its own descendants.</p>
        </section> : null}

        {!folder.trashed ? <section className={sectionClass}>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Share2 className="h-4 w-4" /> Team sharing</h3>
          <p className="mb-3 text-xs text-muted2">Access is inherited by every subfolder and file inside this folder.</p>
          <form action={shareDriveFolder.bind(null, folder.id)} className="flex gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <select name="userId" required defaultValue="" className={`h-10 min-w-0 flex-1 px-3 text-sm ${inputClass}`}>
              <option value="" disabled>Choose team member</option>
              {teamUsers.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
            <button className="rounded-lg bg-electric px-3 text-sm font-medium text-white hover:opacity-90">Share</button>
          </form>
          <div className="mt-4 space-y-2">
            {folder.sharedWith.length ? folder.sharedWith.map((s) => <div key={s.userId} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm"><span>{s.label}</span><form action={unshareDriveFolder.bind(null, folder.id, s.userId)}><input type="hidden" name="returnTo" value={returnTo} /><button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50"><UserMinus className="h-3.5 w-3.5" /> Remove</button></form></div>) : <p className="text-xs text-muted2">Not shared directly with anyone yet.</p>}
          </div>
        </section> : null}

        {canDelete ? <section className="rounded-xl border border-red-200 bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700"><Trash2 className="h-4 w-4" /> Folder lifecycle</h3>
          {!folder.trashed ? <form action={trashDriveFolder.bind(null, folder.id)}><input type="hidden" name="returnTo" value={returnTo} /><button className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"><Trash2 className="h-4 w-4" /> Move folder to Trash</button></form> : <div className="flex flex-wrap gap-2"><form action={restoreDriveFolder.bind(null, folder.id)}><input type="hidden" name="returnTo" value={returnTo} /><button className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-surface"><RotateCcw className="h-4 w-4" /> Restore</button></form><form action={permanentlyDeleteDriveFolder.bind(null, folder.id)} onSubmit={(e) => { if (!window.confirm("Permanently delete this folder, all subfolders and all files inside it? This cannot be undone.")) e.preventDefault(); }}><input type="hidden" name="returnTo" value={returnTo} /><button className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"><Trash2 className="h-4 w-4" /> Delete permanently</button></form></div>}
          <p className="mt-3 text-xs text-muted2">Trash applies to the whole subtree. Permanent deletion removes every contained file and previous stored version.</p>
        </section> : null}
      </aside>
    </div>
  );
}
