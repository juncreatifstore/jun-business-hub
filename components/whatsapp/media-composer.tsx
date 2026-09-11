"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileUp, Image as ImageIcon, Mic, Plus, Send, Square, Trash2, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { replyWhatsAppMedia } from "@/services/whatsapp-inbox";
import { cn } from "@/lib/utils";

/**
 * "+" attachment menu for the WhatsApp composer: take a photo, pick from the
 * gallery, send a file, or record a voice note. Everything goes through the
 * `replyWhatsAppMedia` server action as multipart form data.
 *
 * Voice notes use MediaRecorder with a Meta-compatible container when the
 * browser offers one (audio/mp4 on Safari/iOS, audio/ogg;codecs=opus on
 * Firefox). Chrome only records WebM, which WhatsApp rejects, so the mic is
 * hidden there.
 */
export function MediaComposer({ phone, variant = "icon" }: { phone: string; variant?: "icon" | "button" }) {
  const photoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (file: File) => {
    setSending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file, file.name);
      if (caption) fd.set("caption", caption);
      await replyWhatsAppMedia(phone, fd);
      setPending(null);
      setCaption("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => ref.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setPending(f);
  };

  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] text-ink active:bg-surface-2 hover:bg-surface-2";

  return (
    <>
      <input
        ref={photoRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        hidden
        onChange={onFile}
      />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,video/mp4" hidden onChange={onFile} />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf"
        hidden
        onChange={onFile}
      />
      <Sheet
        title="Joindre"
        className={cn(
          variant === "icon"
            ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
            : "inline-flex items-center gap-1 hover:text-ink",
        )}
        trigger={
          variant === "icon" ? (
            <Plus className="h-5 w-5" />
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Joindre
            </>
          )
        }
      >
        {pending ? (
          <div className="space-y-3">
            <Preview file={pending} />
            {pending.type.startsWith("audio/") ? null : (
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Légende (facultatif)"
                className="h-10 w-full rounded-lg border border-line bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            )}
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setError(null);
                }}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line text-sm text-ink-2"
              >
                <Trash2 className="h-4 w-4" /> Annuler
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => submit(pending)}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-sm font-medium text-accent-fg disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{" "}
                Envoyer
              </button>
            </div>
          </div>
        ) : (
          <div className="-mx-1 divide-y divide-line">
            <button type="button" className={item} onClick={() => pick(photoRef)}>
              <Camera className="h-5 w-5 text-ink-3" /> Prendre une photo
            </button>
            <button type="button" className={item} onClick={() => pick(galleryRef)}>
              <ImageIcon className="h-5 w-5 text-ink-3" /> Photo ou vidéo de la galerie
            </button>
            <button type="button" className={item} onClick={() => pick(fileRef)}>
              <FileUp className="h-5 w-5 text-ink-3" /> Fichier (PDF, Word, Excel…)
            </button>
            <VoiceRecorder onDone={(f) => setPending(f)} itemClass={item} />
            <p className="px-3 pt-3 text-xs text-ink-3">
              Photos JPEG/PNG, vidéos MP4, fichiers jusqu’à 16 Mo.
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return null;
  if (file.type.startsWith("image/"))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="max-h-64 w-full rounded-lg object-contain" />;
  if (file.type.startsWith("video/"))
    return <video src={url} controls className="max-h-64 w-full rounded-lg" />;
  if (file.type.startsWith("audio/")) return <audio src={url} controls className="w-full" />;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-3 text-sm text-ink">
      <FileUp className="h-5 w-5 text-ink-3" />
      <span className="truncate">{file.name}</span>
      <span className="ml-auto shrink-0 text-xs text-ink-3">{(file.size / 1024 / 1024).toFixed(1)} Mo</span>
    </div>
  );
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function VoiceRecorder({ onDone, itemClass }: { onDone: (f: File) => void; itemClass: string }) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    setSupported(Boolean(pickMime()) && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const start = async () => {
    const mime = pickMime();
    if (!mime) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream, { mimeType: mime });
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = mime.split(";")[0];
      const ext = type === "audio/mp4" ? "m4a" : "ogg";
      onDone(new File(chunks.current, `vocal-${Date.now()}.${ext}`, { type }));
      setRecording(false);
      setSeconds(0);
      clearInterval(timer.current);
    };
    rec.current = r;
    r.start(250);
    setRecording(true);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stop = () => rec.current?.stop();

  if (!supported) return null;
  return recording ? (
    <button type="button" className={cn(itemClass, "text-danger")} onClick={stop}>
      <Square className="h-5 w-5 fill-current" /> Arrêter · {Math.floor(seconds / 60)}:
      {String(seconds % 60).padStart(2, "0")}
    </button>
  ) : (
    <button type="button" className={itemClass} onClick={start}>
      <Mic className="h-5 w-5 text-ink-3" /> Enregistrer un vocal
    </button>
  );
}
