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
  INITIALS: "Initiales",
  DATE_SIGNED: "Date de signature",
  NAME: "Nom",
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
    () =>
      signers.flatMap((s) =>
        (s.fields ?? []).map((f, i) => {
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
        }),
      ),
    [signers, pageCount],
  );

  const [placements, setPlacements] = useState<Placement[]>(initial);
  const [activeEmail, setActiveEmail] = useState(signers[0]?.email ?? "");
  const [activeType, setActiveType] = useState<FieldType>("SIGNATURE");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(80);
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
    setPlacements((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        email: activeSigner.email,
        signerName: activeSigner.name,
        type: activeType,
        page,
        x: Math.min(x, 612 - size.width),
        y: Math.min(y, 792 - size.height),
        width: size.width,
        height: size.height,
      },
    ]);
  }

  function moveOrResize(e: React.PointerEvent<HTMLDivElement>) {
    const point = pointFromEvent(e);
    if (resizing) {
      setPlacements((cur) =>
        cur.map((p) =>
          p.id === resizing
            ? {
                ...p,
                width: Math.max(80, Math.min(300, point.x - p.x)),
                height: Math.max(32, Math.min(120, point.y - p.y)),
              }
            : p,
        ),
      );
      return;
    }
    if (!dragging) return;
    setPlacements((cur) =>
      cur.map((p) =>
        p.id === dragging
          ? {
              ...p,
              x: Math.max(0, Math.min(612 - p.width, point.x)),
              y: Math.max(0, Math.min(792 - p.height, point.y)),
            }
          : p,
      ),
    );
  }

  function stopPointerAction() {
    setDragging(null);
    setResizing(null);
  }
  const payload = JSON.stringify(
    placements.map(({ email, type, page: p, x, y, width, height }) => ({
      email,
      type,
      page: p,
      x,
      y,
      width,
      height,
    })),
  );

  return (
    <form action={action} className="min-w-0 space-y-4" data-request-id={requestId}>
      <input type="hidden" name="placements" value={payload} readOnly />

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted2 sm:text-sm">
          Placez les champs visuellement, puis prévisualisez exactement la mise en page avant d’enregistrer.
        </p>
        <Button
          type="button"
          variant={preview ? "primary" : "secondary"}
          onClick={() => setPreview((v) => !v)}
          className="w-full sm:w-auto"
        >
          <Eye className="h-4 w-4" /> {preview ? "Quitter l’aperçu" : "Prévisualiser"}
        </Button>
      </div>

      <div className={`grid min-w-0 gap-4 ${preview ? "" : "xl:grid-cols-[280px_minmax(0,1fr)]"}`}>
        {!preview ? (
          <aside className="min-w-0 space-y-4 rounded-xl border border-line bg-white p-3 sm:p-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted2">Signataire</p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:block xl:space-y-2 xl:overflow-visible xl:px-0 xl:pb-0">
                {signers.map((s) => (
                  <button
                    key={s.email}
                    type="button"
                    onClick={() => setActiveEmail(s.email)}
                    className={`min-w-[190px] shrink-0 rounded-lg border px-3 py-2 text-left text-sm xl:w-full xl:min-w-0 ${activeEmail === s.email ? "border-electric bg-electric/5" : "border-line"}`}
                  >
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="mt-0.5 truncate text-xs text-muted2">
                      {s.role ?? "SIGNER"} · {s.email}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted2">Champ</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(labels) as FieldType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveType(t)}
                    className={`rounded-lg border px-2 py-2 text-xs ${activeType === t ? "border-electric bg-electric/5 text-electric" : "border-line"}`}
                  >
                    {labels[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-surface p-3 text-xs leading-5 text-muted2">
              Choisissez un signataire et un champ, puis touchez le PDF pour le placer. Faites glisser un
              champ pour le déplacer. Les signatures possèdent une poignée de redimensionnement.
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted2">
                Champs sur la page {page}
              </p>
              <div className="space-y-2">
                {pagePlacements.length === 0 ? (
                  <p className="text-xs text-muted2">Aucun champ sur cette page.</p>
                ) : (
                  pagePlacements.map((p) => (
                    <div
                      key={p.id}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-line px-2 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        {p.signerName} · {labels[p.type]} · {p.width}×{p.height}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-1"
                        aria-label={`Supprimer ${labels[p.type]}`}
                        onClick={() => setPlacements((cur) => cur.filter((x) => x.id !== p.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        ) : null}

        <section className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm sm:flex">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Précédente
              </Button>
              <span className="text-center text-xs sm:text-sm">
                Page {page} / {safePageCount}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page >= safePageCount}
                onClick={() => setPage((p) => Math.min(safePageCount, p + 1))}
              >
                Suivante
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 sm:justify-end">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={() => setZoom((z) => Math.max(55, z - 10))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-sm">{zoom}%</span>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={() => setZoom((z) => Math.min(160, z + 10))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="min-w-0 overflow-auto overscroll-contain rounded-xl border border-line bg-surface p-2 sm:p-4">
            <div
              className="mx-auto origin-top"
              style={{
                width: "612px",
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top center",
                marginBottom: `${Math.max(0, (zoom / 100 - 1) * 792)}px`,
              }}
            >
              <div className="relative h-[792px] w-[612px] overflow-hidden bg-white shadow-xl">
                <iframe
                  title="PDF preview"
                  src={`/api/documents/${documentId}/pdf#page=${page}&zoom=page-width&toolbar=0&navpanes=0`}
                  className="absolute inset-0 h-full w-full border-0"
                  style={{ pointerEvents: "none" }}
                />
                <div
                  className={`absolute inset-0 z-10 ${preview ? "cursor-default" : "cursor-crosshair"}`}
                  style={{ touchAction: preview ? "pan-x pan-y" : "none" }}
                  onPointerDown={place}
                  onPointerMove={moveOrResize}
                  onPointerUp={stopPointerAction}
                  onPointerCancel={stopPointerAction}
                  onPointerLeave={stopPointerAction}
                >
                  {pagePlacements.map((p) => (
                    <div
                      key={p.id}
                      onPointerDown={(e) => {
                        if (preview) return;
                        e.stopPropagation();
                        setDragging(p.id);
                      }}
                      className={`absolute z-20 flex select-none items-center justify-center rounded border-2 text-center text-[10px] font-semibold shadow ${preview ? "border-electric/70 bg-electric/10 text-night" : "border-electric bg-white/90 text-night"}`}
                      style={{
                        left: `${(p.x / 612) * 100}%`,
                        top: `${(p.y / 792) * 100}%`,
                        width: `${(p.width / 612) * 100}%`,
                        height: `${(p.height / 792) * 100}%`,
                      }}
                    >
                      <span>
                        {p.signerName.split(" ")[0]} · {labels[p.type]}
                      </span>
                      {!preview && p.type === "SIGNATURE" ? (
                        <button
                          type="button"
                          aria-label="Redimensionner le champ de signature"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setDragging(null);
                            setResizing(p.id);
                          }}
                          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize border-l border-t border-electric bg-white"
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
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <Button type="submit" variant="gold" className="w-full sm:w-auto">
            Enregistrer le placement
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => setPlacements(initial)}
          >
            Réinitialiser
          </Button>
        </div>
      ) : null}
    </form>
  );
}
