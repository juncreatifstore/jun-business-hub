"use client";
import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState, useTransition } from "react";
import { createDocument } from "@/services/documents";
import { generateDocumentDraft } from "@/services/ai";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilePlus2, LayoutTemplate, Sparkles } from "lucide-react";

const TYPES = ["CONTRACT","AGREEMENT","REFUND_AGREEMENT","RECEIPT","INVOICE","LETTER","ATTESTATION","AUTHORIZATION","REPORT","CUSTOM"] as const;
const LANGUAGES = [
  ["FR", "Français"],
  ["EN", "English"],
  ["ES", "Español"],
  ["HT", "Kreyòl ayisyen"],
] as const;

type Template = { id: string; name: string; type: string; content: string };

type CaseOption = { id: string; caseNumber: string; title: string; clientId: string };

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Creating…" : "Create document"}</Button>;
}

export function DocumentCreateForm({
  clients, cases, templates, defaultClientId, defaultCaseId, defaultType, defaultTemplateId,
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
  const [state, action] = useFormState(createDocument, {});
  const [source, setSource] = useState<"BLANK" | "TEMPLATE">(initialTemplate ? "TEMPLATE" : "BLANK");
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [content, setContent] = useState(initialTemplate?.content ?? "");
  const [instruction, setInstruction] = useState("");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const [type, setType] = useState(TYPES.includes((initialTemplate?.type ?? defaultType ?? "") as typeof TYPES[number]) ? (initialTemplate?.type ?? defaultType ?? "CONTRACT") : "CONTRACT");
  const [language, setLanguage] = useState<"FR" | "EN" | "ES" | "HT">("FR");
  const [title, setTitle] = useState(initialTemplate?.name ?? "");
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingAI, startAI] = useTransition();
  const err = (k: string) => state.errors?.[k]?.[0];

  const availableCases = useMemo(() => clientId ? cases.filter((c) => c.clientId === clientId) : cases, [cases, clientId]);
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setSource("TEMPLATE");
    setContent(template.content);
    setTitle((current) => current.trim() ? current : template.name);
    if (TYPES.includes(template.type as typeof TYPES[number])) setType(template.type);
  }

  function chooseBlank() {
    setSource("BLANK");
    setTemplateId("");
    setContent("");
  }

  function changeClient(nextClientId: string) {
    setClientId(nextClientId);
    if (caseId && !cases.some((c) => c.id === caseId && (!nextClientId || c.clientId === nextClientId))) setCaseId("");
  }

  function writeWithAI() {
    setAiError(null);
    const fd = new FormData();
    fd.set("instruction", instruction);
    fd.set("clientId", clientId);
    fd.set("caseId", caseId);
    fd.set("language", language);
    fd.set("documentType", type);
    if (selectedTemplate) fd.set("templateName", selectedTemplate.name);
    startAI(async () => {
      const res = await generateDocumentDraft(fd);
      if (res.error) setAiError(res.error);
      if (res.content) setContent(res.content);
    });
  }

  return (
    <div className="grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form action={action} className="space-y-6">
        <section className="rounded-xl border border-line bg-white p-5">
          <p className="text-sm font-semibold">1. Choose a starting point</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={chooseBlank} className={`rounded-xl border p-4 text-left transition ${source === "BLANK" ? "border-electric bg-electric/5" : "border-line hover:bg-surface"}`}>
              <FilePlus2 className="h-5 w-5 text-electric" />
              <p className="mt-2 font-medium">Blank document</p>
              <p className="mt-1 text-xs text-muted2">Start with an empty draft and write freely or use JUN AI.</p>
            </button>
            <div className={`rounded-xl border p-4 ${source === "TEMPLATE" ? "border-electric bg-electric/5" : "border-line"}`}>
              <div className="flex items-center gap-2"><LayoutTemplate className="h-5 w-5 text-electric" /><p className="font-medium">JUN template</p></div>
              <Select className="mt-3" value={templateId} onChange={(e) => e.target.value ? chooseTemplate(e.target.value) : chooseBlank()}>
                <option value="">Select a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.type.replaceAll("_", " ")}</option>)}
              </Select>
              <p className="mt-2 text-xs text-muted2">{templates.length ? "Template content remains fully editable before finalization." : "No reusable templates have been created yet."}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 rounded-xl border border-line bg-white p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title"><Input name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" /></Field>
            {err("title") && <p className="mt-1 text-xs text-red-600">{err("title")}</p>}
          </div>
          <Field label="Type">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}
            </Select>
          </Field>
          <Field label="Language">
            <Select name="language" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
              {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Client (optional)">
            <Select name="clientId" value={clientId} onChange={(e) => changeClient(e.target.value)}>
              <option value="">No client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}
            </Select>
          </Field>
          <Field label="Case (optional)" hint={clientId ? "Only cases belonging to the selected client are shown." : "Select a client to narrow the case list."}>
            <Select name="caseId" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">No case</option>
              {availableCases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}
            </Select>
          </Field>
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="content" value={content} />
          <div className="sm:col-span-2">
            <Field label="Initial content (HTML)" hint={selectedTemplate ? `Loaded from template: ${selectedTemplate.name}. You may edit it before creation.` : "Leave empty to start with a blank page."}>
              <Textarea rows={14} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" />
            </Field>
          </div>
          {state.message ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Submit />
            <a href="/app/documents" className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface">Cancel</a>
          </div>
        </section>
      </form>

      <aside className="h-fit rounded-xl border border-electric/30 bg-electric/5 p-5 lg:sticky lg:top-6">
        <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-electric" /> Write with JUN AI</p>
        <p className="mt-1 text-xs text-muted2">JUN AI uses the selected language, document type, client and case context. It only drafts — it never finalizes or signs.</p>
        <Textarea className="mt-3" rows={6} placeholder='e.g. "Prepare a professional travel service agreement with payment terms and cancellation conditions."' value={instruction} onChange={(e) => setInstruction(e.target.value)} />
        <Button type="button" variant="primary" className="mt-3 w-full" onClick={writeWithAI} disabled={pendingAI || !instruction.trim()}>
          {pendingAI ? "Drafting…" : "Generate draft"}
        </Button>
        {aiError ? <p className="mt-2 text-xs text-red-600">{aiError}</p> : null}
        <div className="mt-5 rounded-lg border border-line bg-white/70 p-3 text-xs text-muted2">
          <p><strong>Language:</strong> {LANGUAGES.find(([code]) => code === language)?.[1]}</p>
          <p className="mt-1"><strong>Type:</strong> {type.replaceAll("_", " ")}</p>
          <p className="mt-1"><strong>Source:</strong> {selectedTemplate ? selectedTemplate.name : "Blank / AI draft"}</p>
        </div>
      </aside>
    </div>
  );
}
