"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, GripVertical, Plus, RotateCw, Save, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newBlankPage, parseDocumentPages, serializeDocumentPages, type JunDocumentPage } from "@/lib/document-pages";

export function DocumentPageManager({
  documentId,
  title,
  initialHtml,
  action,
  readOnly,
}: {
  documentId: string;
  title: string;
  initialHtml: string;
  action: (formData: FormData) => Promise<void>;
  readOnly: boolean;
}) {
  const initialPages = useMemo(() => parseDocumentPages(initialHtml), [initialHtml]);
  const [pages, setPages] = useState<JunDocumentPage[]>(initialPages);
  const [selected, setSelected] = useState(0);
  const [dragged, setDragged] = useState<number | null>(null);

  const current = pages[Math.min(selected, pages.length - 1)] ?? pages[0];
  const content = serializeDocumentPages(pages);

  function move(from: number, to: number) {
    if (readOnly || from === to || to < 0 || to >= pages.length) return;
    setPages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setSelected(to);
  }

  function addAfter() {
    if (readOnly) return;
    const page = newBlankPage();
    setPages((prev) => {
      const next = [...prev];
      next.splice(selected + 1, 0, page);
      return next;
    });
    setSelected(selected + 1);
  }

  function duplicate() {
    if (readOnly || !current) return;
    const copy = { ...current, id: newBlankPage().id };
    setPages((prev) => {
      const next = [...prev];
      next.splice(selected + 1, 0, copy);
      return next;
    });
    setSelected(selected + 1);
  }

  function remove() {
    if (readOnly || pages.length <= 1) return;
    if (!window.confirm(`Delete page ${selected + 1}?`)) return;
    setPages((prev) => prev.filter((_, i) => i !== selected));
    setSelected((i) => Math.max(0, Math.min(i, pages.length - 2)));
  }

  function rotate() {
    if (readOnly || !current) return;
    const nextRotation = ((current.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    setPages((prev) => prev.map((p, i) => i === selected ? { ...p, rotation: nextRotation } : p));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/app/documents/${documentId}`} className="rounded-md p-2 text-muted2 hover:bg-surface hover:text-night"><ArrowLeft className="h-4 w-4" /></Link>
          <div><p className="truncate text-sm font-semibold">Manage pages</p><p className="truncate text-xs text-muted2">{title} · {pages.length} page{pages.length === 1 ? "" : "s"}</p></div>
        </div>
        {!readOnly ? <form action={action}><input type="hidden" name="content" value={content} /><Button type="submit" variant="primary"><Save className="mr-1.5 h-4 w-4" />Save page layout</Button></form> : null}
      </div>

      <div className="grid min-h-[720px] overflow-hidden rounded-xl border border-line bg-white lg:grid-cols-[250px_minmax(0,1fr)_230px]">
        <aside className="border-r border-line bg-white p-3">
          <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted2">Pages</p>{!readOnly ? <button type="button" onClick={addAfter} className="rounded-md p-1.5 text-muted2 hover:bg-surface" title="Add page"><Plus className="h-4 w-4" /></button> : null}</div>
          <div className="space-y-3">
            {pages.map((page, index) => (
              <div
                key={page.id}
                draggable={!readOnly}
                onDragStart={() => setDragged(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragged !== null) move(dragged, index); setDragged(null); }}
                onClick={() => setSelected(index)}
                className={`group cursor-pointer rounded-lg border-2 p-2 transition ${selected === index ? "border-electric bg-blue-50" : "border-transparent hover:border-line"}`}
              >
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted2"><span>#{index + 1}</span><GripVertical className="h-3.5 w-3.5 opacity-50" /></div>
                <div className="relative aspect-[0.72] overflow-hidden rounded border border-line bg-white shadow-sm">
                  <div className="origin-center scale-[0.23] p-6 text-[14px] text-slate-700" style={{ width: "430%", transform: `scale(.23) rotate(${page.rotation}deg)` }} dangerouslySetInnerHTML={{ __html: page.html }} />
                  {page.rotation ? <span className="absolute bottom-1 right-1 rounded bg-slate-900/75 px-1.5 py-0.5 text-[9px] text-white">{page.rotation}°</span> : null}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="overflow-auto bg-surface p-5 sm:p-8">
          <div className="mx-auto flex min-h-[900px] max-w-[850px] items-start justify-center rounded-md border border-line bg-white shadow-lg">
            {current ? <div className="doc-prose w-full origin-top p-12 text-[15px] text-slate-900" style={{ transform: `rotate(${current.rotation}deg)` }} dangerouslySetInnerHTML={{ __html: current.html }} /> : null}
          </div>
        </main>

        <aside className="border-l border-line bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted2">Page actions</p>
          <p className="mt-2 text-sm font-semibold">Page {selected + 1}</p>
          <p className="text-xs text-muted2">Rotation: {current?.rotation ?? 0}°</p>
          <div className="mt-4 grid gap-2">
            <Button type="button" variant="outline" disabled={readOnly || selected === 0} onClick={() => move(selected, selected - 1)}><ChevronUp className="mr-1.5 h-4 w-4" />Move up</Button>
            <Button type="button" variant="outline" disabled={readOnly || selected >= pages.length - 1} onClick={() => move(selected, selected + 1)}><ChevronDown className="mr-1.5 h-4 w-4" />Move down</Button>
            <Button type="button" variant="outline" disabled={readOnly} onClick={rotate}><RotateCw className="mr-1.5 h-4 w-4" />Rotate 90°</Button>
            <Button type="button" variant="outline" disabled={readOnly} onClick={duplicate}><Copy className="mr-1.5 h-4 w-4" />Duplicate page</Button>
            <Button type="button" variant="outline" disabled={readOnly} onClick={addAfter}><Plus className="mr-1.5 h-4 w-4" />Add page</Button>
            <Button type="button" variant="ghost" className="text-red-600" disabled={readOnly || pages.length <= 1} onClick={remove}><Trash2 className="mr-1.5 h-4 w-4" />Delete page</Button>
          </div>
          <div className="mt-5 rounded-lg border border-line bg-surface p-3 text-xs leading-5 text-muted2">Drag thumbnails to reorder. Saving creates a new document version so the previous layout remains recoverable.</div>
        </aside>
      </div>
    </div>
  );
}
