"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, Loader2, Sparkles, MessageSquareText, Wand2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import {
  transcribeWhatsAppVoice,
  translateWhatsAppInbound,
  aiDraftWhatsAppReply,
  aiTranslateDraft,
} from "@/services/whatsapp-inbox";
import type { QuickReply } from "@/lib/whatsapp-quick-replies";

/* Put text into the active composer textarea (uncontrolled, server-rendered). */
function fillComposer(text: string) {
  const areas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea[name="message"]'));
  const visible = areas.find((a) => a.offsetParent !== null) ?? areas[0];
  if (!visible) return;
  visible.value = text;
  visible.dispatchEvent(new Event("input", { bubbles: true }));
  visible.focus();
}

/** Under a voice-note bubble. */
export function TranscribeButton({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await transcribeWhatsAppVoice(mediaId);
          if (!r) setFailed(true);
          else router.refresh();
        })
      }
      className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-accent hover:underline disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquareText className="h-3 w-3" />}
      {failed ? "Transcription indisponible" : pending ? "Transcription…" : "Transcrire"}
    </button>
  );
}

/** Under an inbound text bubble. */
export function TranslateButton({ messageId, text }: { messageId: string; text: string }) {
  const [pending, start] = useTransition();
  const [french, setFrench] = useState<string | null>(null);
  if (french)
    return <p className="mt-1.5 border-t border-line/60 pt-1.5 text-xs italic text-ink-2">{french}</p>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await translateWhatsAppInbound(messageId, text);
          setFrench(r?.french ?? "Traduction indisponible");
        })
      }
      className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-accent hover:underline disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
      Traduire
    </button>
  );
}

/** Composer helper: quick replies in 3 languages + AI draft / translate. */
export function ReplyAssistant({
  phone,
  quickReplies,
  aiEnabled,
  variant = "button",
}: {
  phone: string;
  quickReplies: QuickReply[];
  aiEnabled: boolean;
  variant?: "button" | "icon";
}) {
  const [lang, setLang] = useState<"fr" | "ht" | "es">("fr");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<{
    reply: string;
    french: string;
    summary: string;
    language: string;
  } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet
      title="Réponses rapides et IA"
      className={
        variant === "icon"
          ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
          : "inline-flex items-center gap-1 hover:text-ink"
      }
      trigger={
        variant === "icon" ? (
          <Sparkles className="h-5 w-5" />
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" /> Réponses
          </>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">Réponses rapides</p>
            <div className="flex gap-1">
              {(["fr", "ht", "es"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase ${
                    lang === l ? "border-ink bg-ink text-canvas" : "border-line text-ink-2"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-line rounded-xl border border-line bg-surface-1">
            {quickReplies.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => fillComposer(q[lang])}
                className="block w-full px-3 py-2.5 text-left active:bg-surface-2 hover:bg-surface-2"
              >
                <span className="block text-xs font-semibold text-ink">{q.label}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-ink-2">{q[lang]}</span>
              </button>
            ))}
          </div>
        </div>

        {aiEnabled ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Assistant</p>
            <div className="space-y-2">
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Consigne (facultatif) : ex. demander le passeport et proposer un rendez-vous"
                className="h-10 w-full rounded-lg border border-line bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const r = await aiDraftWhatsAppReply(phone, instruction || undefined);
                      if (!r) setError("L’assistant n’a pas pu produire de réponse.");
                      else setDraft(r);
                    })
                  }
                  className="flex h-10 items-center justify-center gap-2 rounded-lg bg-ink text-sm font-medium text-canvas disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Résumer et rédiger
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const area = document.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
                      const current = area?.value.trim();
                      if (!current) {
                        setError("Écrivez d’abord votre brouillon en français dans le champ de réponse.");
                        return;
                      }
                      const r = await aiTranslateDraft(phone, current);
                      if (!r) setError("Traduction indisponible.");
                      else fillComposer(r);
                    })
                  }
                  className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface-1 text-sm font-medium text-ink disabled:opacity-60"
                >
                  <Languages className="h-4 w-4" /> Traduire mon brouillon
                </button>
              </div>
              {error ? <p className="text-xs text-danger">{error}</p> : null}
              {draft ? (
                <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
                  {draft.summary ? (
                    <p className="text-xs text-ink-2">
                      <span className="font-semibold text-ink">Résumé · </span>
                      {draft.summary}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm text-ink">{draft.reply}</p>
                  {draft.french && draft.french !== draft.reply ? (
                    <p className="whitespace-pre-wrap border-t border-line pt-2 text-xs italic text-ink-2">
                      {draft.french}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => fillComposer(draft.reply)}
                    className="h-9 w-full rounded-lg bg-accent text-sm font-medium text-accent-fg"
                  >
                    Utiliser cette réponse
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-3">
            Assistant IA désactivé : ajoutez OPENAI_API_KEY pour activer résumé, brouillon, traduction et
            transcription des vocaux.
          </p>
        )}
      </div>
    </Sheet>
  );
}
