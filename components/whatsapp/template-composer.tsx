"use client";

import { useMemo, useState } from "react";
import { Send, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { ApprovedTemplate } from "@/lib/whatsapp";
import { replyWhatsAppTemplate } from "@/services/whatsapp-inbox";

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
  const [name, setName] = useState(templates[0]?.name ?? "");
  const tpl = useMemo(() => templates.find((t) => t.name === name) ?? templates[0], [templates, name]);
  const [params, setParams] = useState<string[]>(() =>
    Array.from({ length: tpl?.paramCount ?? 0 }, (_, i) => defaults[i] ?? ""),
  );

  const choose = (n: string) => {
    setName(n);
    const t = templates.find((x) => x.name === n);
    setParams(Array.from({ length: t?.paramCount ?? 0 }, (_, i) => defaults[i] ?? ""));
  };
  const preview = tpl ? tpl.body.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] || `[${i}]`) : "";

  if (!templates.length) {
    return (
      <div className="tint-warning rounded-lg px-3 py-2.5 text-xs text-warning">
        {windowClosed
          ? "Ce client n’a pas écrit depuis plus de 24 h : WhatsApp n’autorise que l’envoi d’un modèle approuvé, et aucun modèle approuvé n’a été trouvé. Vérifiez Réglages → WhatsApp (identifiant du compte business) et Meta WhatsApp Manager."
          : "Aucun modèle approuvé trouvé dans Meta WhatsApp Manager."}
      </div>
    );
  }

  return (
    <form action={replyWhatsAppTemplate.bind(null, phone)} className={compact ? "space-y-2" : "space-y-3"}>
      {windowClosed ? (
        <p className="flex items-start gap-2 text-xs text-warning">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Ce client n’a pas écrit depuis plus de 24 h : WhatsApp n’autorise que l’envoi d’un modèle approuvé.
        </p>
      ) : null}
      <Select name="template" value={name} onChange={(e) => choose(e.target.value)} className="h-10">
        {templates.map((t) => (
          <option key={`${t.name}-${t.language}`} value={t.name}>
            {t.name} · {t.language}
          </option>
        ))}
      </Select>
      <input type="hidden" name="language" value={tpl?.language ?? "fr"} />
      <input type="hidden" name="preview" value={preview} />
      {params.length ? (
        <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
          {params.map((v, i) => (
            <Input
              key={i}
              name={`p${i + 1}`}
              value={v}
              onChange={(e) => setParams((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Variable {{${i + 1}}}`}
              required
              className="h-10"
            />
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
  );
}
