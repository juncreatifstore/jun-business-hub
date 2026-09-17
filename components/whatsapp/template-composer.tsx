"use client";

import { useMemo, useState } from "react";
import { Send, Clock3, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { ApprovedTemplate } from "@/lib/whatsapp";
import { replyWhatsAppTemplate } from "@/services/whatsapp-inbox";
import { sendRefundClaimFromWhatsAppInbox } from "@/services/whatsapp-refund-claim";

function RefundClaimShortcut({ phone, compact }: { phone: string; compact: boolean }) {
  return (
    <form
      action={sendRefundClaimFromWhatsAppInbox.bind(null, phone)}
      className={`rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] ${compact ? "p-2.5" : "p-3"}`}
    >
      <div className={compact ? "space-y-2" : "flex flex-wrap items-center justify-between gap-3"}>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-emerald-700">Demande de remboursement</div>
          {!compact ? (
            <p className="mt-0.5 text-xs text-muted2">
              Crée un lien sécurisé pour ce client et l’envoie avec le modèle WhatsApp approuvé, même après 24
              h.
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="outline" className={compact ? "w-full" : "shrink-0"}>
          <Undo2 className="h-4 w-4" /> Envoyer le lien de demande de remboursement
        </Button>
      </div>
    </form>
  );
}

/**
 * Template picker used when the 24-hour customer-service window is closed.
 * Shows the approved templates, the rendered preview, and one input per
 * placeholder — prefilled with what we know (first name, case number).
 */
export function TemplateComposer({
  phone,
  templates,
  defaults,
  windowClosed,
  compact = false,
}: {
  phone: string;
  templates: ApprovedTemplate[];
  defaults: string[];
  windowClosed: boolean;
  compact?: boolean;
}) {
  const idOf = (t: ApprovedTemplate) => `${t.name}::${t.language}`;
  const [id, setId] = useState(templates[0] ? idOf(templates[0]) : "");
  const tpl = useMemo(() => templates.find((t) => idOf(t) === id) ?? templates[0], [templates, id]);
  const [params, setParams] = useState<string[]>(() =>
    Array.from({ length: tpl?.paramCount ?? 0 }, (_, i) => defaults[i] ?? ""),
  );

  const choose = (v: string) => {
    setId(v);
    const t = templates.find((x) => idOf(x) === v);
    setParams(Array.from({ length: t?.paramCount ?? 0 }, (_, i) => defaults[i] ?? ""));
  };
  const keys = tpl?.params ?? [];
  const preview = tpl
    ? tpl.body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k: string) => {
        const idx = keys.indexOf(k);
        return (idx >= 0 ? params[idx] : "") || `[${k}]`;
      })
    : "";

  if (!templates.length) {
    return (
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {windowClosed ? <RefundClaimShortcut phone={phone} compact={compact} /> : null}
        <div className="tint-warning rounded-lg px-3 py-2.5 text-xs text-warning">
          {windowClosed
            ? "Ce client n’a pas écrit depuis plus de 24 h : WhatsApp n’autorise que l’envoi d’un modèle approuvé, et aucun modèle approuvé n’a été trouvé. Vérifiez Réglages → WhatsApp (identifiant du compte business) et Meta WhatsApp Manager."
            : "Aucun modèle approuvé trouvé dans Meta WhatsApp Manager."}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {windowClosed ? <RefundClaimShortcut phone={phone} compact={compact} /> : null}
      <form action={replyWhatsAppTemplate.bind(null, phone)} className={compact ? "space-y-2" : "space-y-3"}>
        {windowClosed ? (
          <p className="flex items-start gap-2 text-xs text-warning">
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Ce client n’a pas écrit depuis plus de 24 h : WhatsApp n’autorise que l’envoi d’un modèle
            approuvé.
          </p>
        ) : null}
        <Select value={id} onChange={(e) => choose(e.target.value)} className="h-10">
          {templates.map((t) => (
            <option key={idOf(t)} value={idOf(t)}>
              {t.name} · {t.language}
              {t.paramCount ? ` · ${t.paramCount} variable${t.paramCount > 1 ? "s" : ""}` : ""}
            </option>
          ))}
        </Select>
        <input type="hidden" name="template" value={tpl?.name ?? ""} />
        <input type="hidden" name="language" value={tpl?.language ?? "fr"} />
        <input type="hidden" name="preview" value={preview} />
        {params.length ? (
          <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
            {params.map((v, i) => (
              <div key={i}>
                <input type="hidden" name={`n${i + 1}`} value={keys[i] ?? String(i + 1)} />
                <Input
                  name={`p${i + 1}`}
                  value={v}
                  onChange={(e) => setParams((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`{{${keys[i] ?? i + 1}}}`}
                  aria-label={`Variable ${keys[i] ?? i + 1}`}
                  required
                  className="h-10"
                />
              </div>
            ))}
          </div>
        ) : null}
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-6 text-ink">
          {preview || "—"}
        </div>
        <Button variant="primary" className="w-full sm:w-auto">
          <Send className="h-4 w-4" /> Envoyer le modèle
        </Button>
      </form>
    </div>
  );
}
