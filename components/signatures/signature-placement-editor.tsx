"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { defaultSignatureFieldSize, type SignatureFieldType } from "@/lib/signature-recipients";
import { Eye, Minus, Plus, Trash2 } from "lucide-react";

type FieldType = SignatureFieldType;
type Placement = {
  id: string;
  email: string;
  signerName: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Signer = {
  name: string;
  email: string;
  role?: string | null;
  fields?: { type: FieldType; page: number; x: number; y: number; width?: number; height?: number }[];
};

const labels: Record<FieldType, string> = {
  SIGNATURE: "Signature",
  INITIALS: "Initials",
  DATE_SIGNED: "Date signed",
  NAME: "Name",
};

export function SignaturePlacementEditor({
  requestId,
  documentId,
  signers,
  pageCount,
  action,
}: {
  requestId: string;
  documentId: string;
  signers: Signer[];
  pageCount: number;
  action: (formData: FormData) => void;
}) {
  const initial = useMemo<Placement[]>(
    () => signers.flatMap((s) => (s.fields ?? []).map((f, i) => {
      const size = defaultSignatureFieldSize(f.type);
      return {
        id: `${s.email}-${f.type}-${i}`,
        email: s.email,
        signerName: s.name,
        type: f.type,
        page: Math.min(Math.max(1, f.page), Math.max(1, pageCount)),
        x: f.x,
        y: f.y,
        width: f.width ?? size.width,
        height: f.height ?? size.height,
      };
    })),
    [signers, pageCount]
  );
  const [placements, setPlacements] = useState<Placement[]>(initial);
  const [activeEmail, setActiveEmail] = useState(signers[0]?.email ?? "");
  const [activeType, setActiveType] = useState<FieldType>("SIGNATURE");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [dragging, setDragging] = useState<string | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const activeSigner = signers.find((s) => s.email === activeEmail) ?? signers[0];
  const pagePlacements = placements.filter((p) => p.page === page);
  const safePageCount = Math.max(1, pageCount);

  function pointFromEvent(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(612, Math.round(((e.clientX - r.left) / r.width) * 612))),
      y: Math.max(0, Math.min(792, Math.round(((e.clientY - r.top) / r.height) * 792))),
    };
  }

  function place(e: React.PointerEvent<HTMLDivElement>) {
    if (preview || dragging || resizing || !activeSigner) return;
    const { x, y } = pointFromEvent(e);
    const size = defaultSignatureFieldSize(activeType);
    setPlacements((cur) => [...cur, {
      id: crypto.randomUUID(),
      email: activeSigner.email,
      signerName: activeSigner.name,
      type: activeType,
      page,
      x: Math.min(x, 612 - size.width),
      y: Math.min(y, 792 - size.height),
      width: size.width,
      height: size.height,
    }]);
  }

  function moveOrResize(e: React.PointerEvent<HTMLDivElement>) {
    const point = pointFromEvent(e);
    if (resizing) {
      setPlacements((cur) => cur.map((p) => p.id === resizing ? {
        ...p,
        width: Math.max(80, Math.min(300, point.x - p.x)),
        height: Math.max(32, Math.min(120, point.y - p.y)),
      } : p));
      return;
    }
    if (!dragging) return;
    setPlacements((cur) => cur.map((p) => p.id === dragging ? {
      ...p,
      x: Math.max(0, Math.min(612 - p.width, point.x)),
      y: Math.max(0, Math.min(792 - p.height, point.y)),
    } : p));
  }

  function stopPointerAction() {
    setDragging(null);
    setResizing(null);
  }

  const payload = JSON.stringify(placements.map(({ email, type, page: p, x, y, width, height }) => ({ email, type, page: p, x, y, width, height })));

  return (
    <form action={action} className="space-y-4" data-request-id={requestId}>
      <input type="hidden" name="placements" value={payload} readOnly />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
        <p className="text-sm text-muted2">Place fields visually, then preview the exact signing layout before saving.</p>
        <Button type="button" variant={preview ? "primary" : "secondary"} onClick={() => setPreview((v) => !v)}>
          <Eye className="h-4 w-4" /> {preview ? "Exit preview" : "Preview signing layout"}
        </Button>
      </div>

      <div className={`grid gap-4 ${preview ? "" : "xl:grid-cols-[280px_minmax(0,1fr)]"}`}>
        {!preview ? (
          <aside className="space-y-4 rounded-xl border border-line bg-white p-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted2">Signer</p>
              <div className="space-y-2">
                {signers.map((s) => (
                  <button key={s.email} type="button" onClick={() => setActiveEmail(s.email)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${activeEmail === s.email ? "border-electric bg-electric/5" : "border-line"}`}>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted2">{s.role ?? "SIGNER"} · {s.email}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted2">Field</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(labels) as FieldType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setActiveType(t)} className={`rounded-lg border px-2 py-2 text-xs ${activeType === t ? "border-electric bg-electric/5 text-electric" : "border-line"}`}>
                    {labels[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-surface p-3 text-xs text-muted2">Choose a signer and field, then click the PDF to place it. Drag a field to move it. Signature fields have a resize handle in the bottom-right corner.</div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted2">Fields on page {page}</p>
              <div className="space-y-2">
                {pagePlacements.length === 0 ? <p className="text-xs text-muted2">No fields on this page.</p> : pagePlacements.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-2 text-xs">
                    <span>{p.signerName} · {labels[p.type]} · {p.width}×{p.height}</span>
                    <button type="button" aria-label={`Delete ${labels[p.type]}`} onClick={() => setPlacements((cur) => cur.filter((x) => x.id !== p.id))}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
            <div className="flex items-center gap-2 text-sm">
              <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
              <span>Page {page} of {safePageCount}</span>
              <Button type="button" size="sm" variant="secondary" disabled={page >= safePageCount} onClick={() => setPage((p) => Math.min(safePageCount, p + 1))}>Next</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="icon" variant="secondary" onClick={() => setZoom((z) => Math.max(60, z - 10))}><Minus className="h-4 w-4" /></Button>
              <span className="w-12 text-center text-sm">{zoom}%</span>
              <Button type="button" size="icon" variant="secondary" onClick={() => setZoom((z) => Math.min(160, z + 10))}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-line bg-surface p-4">
            <div className="mx-auto origin-top" style={{ width: "612px", transform: `scale(${zoom / 100})`, transformOrigin: "top center", marginBottom: `${Math.max(0, (zoom / 100 - 1) * 792)}px` }}>
              <div className="relative h-[792px] w-[612px] overflow-hidden bg-white shadow-xl">
                <iframe title="PDF preview" src={`/api/documents/${documentId}/pdf#page=${page}&zoom=page-width&toolbar=0&navpanes=0`} className="absolute inset-0 h-full w-full border-0" style={{ pointerEvents: "none" }} />
                <div
                  className={`absolute inset-0 z-10 ${preview ? "cursor-default" : "cursor-crosshair"}`}
                  onPointerDown={place}
                  onPointerMove={moveOrResize}
                  onPointerUp={stopPointerAction}
                  onPointerLeave={stopPointerAction}
                >
                  {pagePlacements.map((p) => (
                    <div
                      key={p.id}
                      onPointerDown={(e) => { if (preview) return; e.stopPropagation(); setDragging(p.id); }}
                      className={`absolute z-20 flex select-none items-center justify-center rounded border-2 text-center text-[10px] font-semibold shadow ${preview ? "border-electric/70 bg-electric/10 text-night" : "border-electric bg-white/90 text-night"}`}
                      style={{
                        left: `${(p.x / 612) * 100}%`,
                        top: `${(p.y / 792) * 100}%`,
                        width: `${(p.width / 612) * 100}%`,
                        height: `${(p.height / 792) * 100}%`,
                      }}
                    >
                      <span>{p.signerName.split(" ")[0]} · {labels[p.type]}</span>
                      {!preview && p.type === "SIGNATURE" ? (
                        <button
                          type="button"
                          aria-label="Resize signature field"
                          onPointerDown={(e) => { e.stopPropagation(); setDragging(null); setResizing(p.id); }}
                          className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize border-l border-t border-electric bg-white"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {!preview ? (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="gold">Save field placement</Button>
          <Button type="button" variant="secondary" onClick={() => setPlacements(initial)}>Reset changes</Button>
        </div>
      ) : null}
    </form>
  );
}
