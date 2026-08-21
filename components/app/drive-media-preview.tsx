"use client";

import { FileText, Image as ImageIcon, Music2, PlaySquare } from "lucide-react";

export function DriveMediaPreview({ fileId, name, mimeType }: { fileId: string; name: string; mimeType: string }) {
  const src = `/api/files/${fileId}`;
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const isText = mimeType.startsWith("text/");
  const isVideo = mimeType.startsWith("video/");
  const isAudio = mimeType.startsWith("audio/");

  return <section className="mb-5 rounded-xl border border-line bg-white p-4">
    <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Preview</h3><p className="mt-1 text-xs text-muted2">Quick internal preview without leaving the Drive.</p></div><a href={src} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink hover:bg-surface">Open full file</a></div>
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {isImage ? <div className="flex min-h-[260px] items-center justify-center bg-slate-950 p-3"><img src={src} alt={name} className="max-h-[520px] max-w-full rounded-lg object-contain" /></div>
      : isPdf || isText ? <iframe src={src} title={name} className="h-[460px] w-full bg-white" />
      : isVideo ? <div className="flex min-h-[280px] items-center justify-center bg-black p-3"><video src={src} controls preload="metadata" className="max-h-[520px] w-full rounded-lg" /></div>
      : isAudio ? <div className="flex min-h-[180px] flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-white"><Music2 className="h-10 w-10 text-white/50" /><div className="max-w-full truncate text-sm text-white/70">{name}</div><audio src={src} controls preload="metadata" className="w-full max-w-xl" /></div>
      : <div className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center"><div className="mb-3 rounded-xl bg-white p-3 text-muted2">{mimeType.startsWith("image/") ? <ImageIcon className="h-7 w-7" /> : mimeType.startsWith("video/") ? <PlaySquare className="h-7 w-7" /> : <FileText className="h-7 w-7" />}</div><div className="text-sm font-medium text-ink">Inline preview is not available for this format</div><p className="mt-1 max-w-md text-xs text-muted2">The file remains available in the Drive and can be opened in a new tab. Connected Google Drive/OneDrive files can use their provider-native preview.</p></div>}
    </div>
  </section>;
}
