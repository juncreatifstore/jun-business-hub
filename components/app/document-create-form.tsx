"use client";
import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState, useTransition } from "react";
import { createDocumentD5 } from "@/services/document-create-d5";
import { generateDocumentDraft } from "@/services/ai";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilePlus2, LayoutTemplate, Sparkles } from "lucide-react";

const TYPES = [
  "CONTRACT",
  "AGREEMENT",
  "REFUND_AGREEMENT",
  "RECEIPT",
  "INVOICE",
  "LETTER",
  "ATTESTATION",
  "AUTHORIZATION",
  "REPORT",
  "CUSTOM",
] as const;
const LANGUAGES = [
  ["FR", "Français"],
  ["EN", "English"],
  ["ES", "Español"],
  ["HT", "Kreyòl ayisyen"],
] as const;

type TemplateVariable = {
  key?: string;
  label?: string;
  required?: boolean;
  automatic?: boolean;
  defaultValue?: string;
};
type Template = {
  id: string;
  name: string;
  type: string;
  content: string;
  category: string;
  language: string;
  variables: unknown;
};
type CaseOption = { id: string; caseNumber: string; title: string; clientId: string };

function normalizeVariables(value: unknown): TemplateVariable[] {
  return Array.isArray(value)
    ? value.filter((v): v is TemplateVariable => Boolean(v && typeof v === "object"))
    : [];
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Création…" : "Créer le document"}
    </Button>
  );
}

export function DocumentCreateForm({
  clients,
  cases,
  templates,
  defaultClientId,
  defaultCaseId,
  defaultType,
  defaultTemplateId,
}: {
  clients: { id: string; firstName: string; lastName: string; internalId: string }[];
  cases: CaseOption[];
  templates: Template[];
  defaultClientId?: string;
  defaultCaseId?: string;
  defaultType?: string;
  defaultTemplateId?: string;
}) {
  const initialTemplate = templates.find((t) => t.id === defaultTemplateId) ?? null;
  const [state, action] = useFormState(createDocumentD5, {});
  const [source, setSource] = useState<"BLANK" | "TEMPLATE">(initialTemplate ? "TEMPLATE" : "BLANK");
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [content, setContent] = useState(initialTemplate?.content ?? "");
  const [instruction, setInstruction] = useState("");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const [type, setType] = useState(
    TYPES.includes((initialTemplate?.type ?? defaultType ?? "") as (typeof TYPES)[number])
      ? (initialTemplate?.type ?? defaultType ?? "CONTRACT")
      : "CONTRACT",
  );
  const initialLanguage = LANGUAGES.some(([code]) => code === initialTemplate?.language)
    ? (initialTemplate?.language as "FR" | "EN" | "ES" | "HT")
    : "FR";
  const [language, setLanguage] = useState<"FR" | "EN" | "ES" | "HT">(initialLanguage);
  const [title, setTitle] = useState(initialTemplate?.name ?? "");
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingAI, startAI] = useTransition();
  const err = (k: string) => state.errors?.[k]?.[0];

  const availableCases = useMemo(
    () => (clientId ? cases.filter((c) => c.clientId === clientId) : cases),
    [cases, clientId],
  );
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const inputVariables = normalizeVariables(selectedTemplate?.variables).filter((v) => v.key && !v.automatic);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setSource("TEMPLATE");
    setContent(template.content);
    setTitle((current) => (current.trim() ? current : template.name));
    if (TYPES.includes(template.type as (typeof TYPES)[number])) setType(template.type);
    if (LANGUAGES.some(([code]) => code === template.language))
      setLanguage(template.language as typeof language);
  }

  function chooseBlank() {
    setSource("BLANK");
    setTemplateId("");
    setContent("");
  }
  function changeClient(nextClientId: string) {
    setClientId(nextClientId);
    if (caseId && !cases.some((c) => c.id === caseId && (!nextClientId || c.clientId === nextClientId)))
      setCaseId("");
  }

  function writeWithAI() {
    setAiError(null);
    const fd = new FormData();
    const languageName = LANGUAGES.find(([code]) => code === language)?.[1] ?? language;
    const sourceContext = selectedTemplate
      ? ` Base the draft on the selected JUN template named "${selectedTemplate.name}".`
      : "";
    fd.set(
      "instruction",
      `Write the document in ${languageName}. Document type: ${type.replaceAll("_", " ")}.${sourceContext} ${instruction}`,
    );
    fd.set("clientId", clientId);
    fd.set("caseId", caseId);
    startAI(async () => {
      const res = await generateDocumentDraft(fd);
      if (res.error) setAiError(res.error);
      if (res.content) setContent(res.content);
    });
  }

  return (
    <div className="grid w-full min-w-0 max-w-6xl gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form action={action} className="min-w-0 space-y-4 sm:space-y-6">
        <section className="min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className="text-sm font-semibold">1. Choisir un point de départ</p>
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={chooseBlank}
              className={`min-w-0 rounded-xl border p-4 text-left transition ${source === "BLANK" ? "border-electric bg-electric/5" : "border-line hover:bg-surface"}`}
            >
              <FilePlus2 className="h-5 w-5 text-electric" />
              <p className="mt-2 font-medium">Document vierge</p>
              <p className="mt-1 text-xs text-muted2">
                Commencer vide puis rédiger librement ou utiliser JUN AI.
              </p>
            </button>
            <div
              className={`min-w-0 rounded-xl border p-4 ${source === "TEMPLATE" ? "border-electric bg-electric/5" : "border-line"}`}
            >
              <div className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5 shrink-0 text-electric" />
                <p className="font-medium">Modèle JUN</p>
              </div>
              <Select
                className="mt-3 min-w-0"
                value={templateId}
                onChange={(e) => (e.target.value ? chooseTemplate(e.target.value) : chooseBlank())}
              >
                <option value="">Sélectionner un modèle…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.language} · {t.type.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-xs text-muted2">
                {templates.length
                  ? "Seuls les modèles actifs sont affichés."
                  : "Aucun modèle actif. Ouvrez la bibliothèque de modèles pour en créer un."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 sm:gap-5 sm:p-5">
          <div className="min-w-0 sm:col-span-2">
            <Field label="Titre">
              <Input
                name="title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titre du document"
              />
            </Field>
            {err("title") && <p className="mt-1 text-xs text-red-600">{err("title")}</p>}
          </div>
          <div className="min-w-0">
            <Field label="Type">
              <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-0">
            <Field label="Langue">
              <Select
                name="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                {LANGUAGES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-0">
            <Field label="Client (optionnel)">
              <Select name="clientId" value={clientId} onChange={(e) => changeClient(e.target.value)}>
                <option value="">Aucun client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.lastName}, {c.firstName} — {c.internalId}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-0">
            <Field
              label="Dossier (optionnel)"
              hint={
                clientId
                  ? "Seuls les dossiers du client sélectionné sont affichés."
                  : "Sélectionnez un client pour réduire la liste."
              }
            >
              <Select name="caseId" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                <option value="">Aucun dossier</option>
                {availableCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber} — {c.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="content" value={content} />

          {selectedTemplate && inputVariables.length > 0 ? (
            <div className="min-w-0 rounded-xl border border-electric/20 bg-electric/5 p-4 sm:col-span-2">
              <p className="text-sm font-semibold">Variables du modèle</p>
              <p className="mt-1 text-xs text-muted2">
                Client, date et dossier sont remplis automatiquement. Complétez les autres valeurs.
              </p>
              <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                {inputVariables.map((v) => (
                  <div key={v.key} className="min-w-0">
                    <Field label={v.label || v.key || "Variable"}>
                      <Input
                        name={`var:${v.key}`}
                        defaultValue={v.defaultValue ?? (v.key === "currency" ? "USD" : "")}
                        required={Boolean(v.required)}
                        placeholder={
                          v.key === "amount" ? "ex. 4500" : v.key === "currency" ? "USD" : "Saisir une valeur"
                        }
                      />
                    </Field>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="min-w-0 sm:col-span-2">
            <Field
              label="Contenu initial (HTML)"
              hint={
                selectedTemplate
                  ? `Chargé depuis le modèle : ${selectedTemplate.name}. Les variables sont résolues lors de la création.`
                  : "Laissez vide pour commencer avec une page blanche."
              }
            >
              <Textarea
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[240px] max-w-full resize-y overflow-x-auto font-mono text-xs sm:min-h-[330px]"
              />
            </Field>
          </div>
          {state.message ? (
            <p className="break-words text-sm text-red-600 sm:col-span-2">{state.message}</p>
          ) : null}
          <div className="grid gap-2 sm:col-span-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <Submit />
            <a
              href="/app/documents"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface sm:w-auto"
            >
              Annuler
            </a>
          </div>
        </section>
      </form>

      <aside className="min-w-0 h-fit rounded-2xl border border-electric/30 bg-electric/5 p-4 sm:p-5 lg:sticky lg:top-6">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 shrink-0 text-electric" />
          Rédiger avec JUN AI
        </p>
        <p className="mt-1 text-xs text-muted2">
          JUN AI utilise la langue, le type de document, le client et le dossier sélectionnés. Il prépare
          uniquement un brouillon : il ne finalise ni ne signe.
        </p>
        <Textarea
          className="mt-3 min-h-[130px]"
          rows={5}
          placeholder="Ex. « Préparer un accord professionnel de service de voyage avec conditions de paiement et d’annulation. »"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <Button
          type="button"
          variant="primary"
          className="mt-3 w-full"
          onClick={writeWithAI}
          disabled={pendingAI || !instruction.trim()}
        >
          {pendingAI ? "Rédaction…" : "Générer le brouillon"}
        </Button>
        {aiError ? <p className="mt-2 break-words text-xs text-red-600">{aiError}</p> : null}
        <div className="mt-5 min-w-0 rounded-xl border border-line bg-white/70 p-3 text-xs text-muted2">
          <p className="break-words">
            <strong>Langue :</strong> {LANGUAGES.find(([code]) => code === language)?.[1]}
          </p>
          <p className="mt-1 break-words">
            <strong>Type :</strong> {type.replaceAll("_", " ")}
          </p>
          <p className="mt-1 break-words">
            <strong>Source :</strong>{" "}
            {selectedTemplate ? selectedTemplate.name : "Document vierge / Brouillon IA"}
          </p>
          {selectedTemplate ? (
            <p className="mt-1">
              <strong>Variables :</strong> {normalizeVariables(selectedTemplate.variables).length}
            </p>
          ) : null}
        </div>
        <a
          href="/app/documents/templates"
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-line bg-white px-3 text-center text-sm font-medium hover:bg-surface"
        >
          Ouvrir la bibliothèque de modèles
        </a>
      </aside>
    </div>
  );
}
