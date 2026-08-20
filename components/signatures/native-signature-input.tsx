"use client";

import { useEffect, useRef, useState } from "react";
import { PenLine, Type, Trash2 } from "lucide-react";

type Mode = "TYPE" | "DRAW";

export function NativeSignatureInput({ defaultName }: { defaultName: string }) {
  const [mode, setMode] = useState<Mode>("TYPE");
  const [name, setName] = useState(defaultName);
  const [signatureData, setSignatureData] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData("");
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = event.currentTarget;
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
    setSignatureData(canvas.toDataURL("image/png"));
  }

  useEffect(() => {
    if (mode === "TYPE") setSignatureData("");
  }, [mode]);

  return (
    <div>
      <input type="hidden" name="signatureMethod" value={mode} />
      <input type="hidden" name="signatureData" value={signatureData} />

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1">
        <button type="button" onClick={() => setMode("TYPE")} className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition ${mode === "TYPE" ? "bg-white text-night shadow-sm" : "text-muted2 hover:text-night"}`}>
          <Type className="h-4 w-4" /> Type
        </button>
        <button type="button" onClick={() => setMode("DRAW")} className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition ${mode === "DRAW" ? "bg-white text-night shadow-sm" : "text-muted2 hover:text-night"}`}>
          <PenLine className="h-4 w-4" /> Draw
        </button>
      </div>

      <label className="mt-4 block text-sm font-medium" htmlFor="signatureName">Full legal name</label>
      <input id="signatureName" name="signatureName" required value={name} onChange={(e) => setName(e.target.value)} maxLength={160} className="mt-2 h-12 w-full rounded-lg border border-line px-3 outline-none focus:border-electric focus:ring-2 focus:ring-electric/20" />

      {mode === "TYPE" ? (
        <div className="mt-4 rounded-xl border border-line bg-white px-4 py-5">
          <p className="text-xs uppercase tracking-wider text-muted2">Signature preview</p>
          <p className="mt-3 min-h-9 overflow-hidden text-2xl italic text-night" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>{name || "Your signature"}</p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div><p className="text-sm font-medium">Draw your signature</p><p className="text-xs text-muted2">Use your mouse, trackpad or finger.</p></div>
            <button type="button" onClick={clearCanvas} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium hover:bg-surface"><Trash2 className="h-3.5 w-3.5" />Clear</button>
          </div>
          <canvas
            ref={canvasRef}
            width={640}
            height={220}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={(e) => { if (drawingRef.current && e.buttons === 0) stopDrawing(e); }}
            className="h-[150px] w-full touch-none rounded-xl border border-line bg-white shadow-inner"
            aria-label="Draw your signature"
          />
          <p className="mt-2 text-xs text-muted2">Your drawing is embedded into the signed PDF. JUN records a cryptographic hash of the signature image for the audit trail.</p>
        </div>
      )}
    </div>
  );
}
