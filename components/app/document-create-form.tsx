"use client";
import { useFormState, useFormStatus } from "react-dom";
import { useState, useTransition } from "react";
import { createDocument } from "@/services/documents";
import { generateDocumentDraft } from "@/services/ai";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const TYPES = ["CONTRACT","AGREEMENT","REFUND_AGREEMENT","RECEIPT","INVOICE","LETTER","ATTESTATION","AUTHORIZATION","REPORT","CUSTOM"];

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Creating…" : "Create document"}</Button>;
}

export function DocumentCreateForm({
  clients, cases, defaultClientId, defaultCaseId, defaultType,
}: {
  clients: { id: string; firstName: string; lastName: string; internalId: string }[];
  cases: { id: string; caseNumber: string; title: string }[];
  defaultClientId?: string;
  defaultCaseId?: string;
  defaultType?: string;
}) {
  const [state, action] = useFormState(createDocument, {});
  const [content, setContent] = useState("");
  const [instruction, setInstruction] = useState("");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingAI, startAI] = useTransition();
  const err = (k: string) => state.errors?.[k]?.[0];

  function writeWithAI() {
    setAiError(null);
    const fd = new FormData();
    fd.set("instruction", instruction);
    fd.set("clientId", clientId);
    fd.set("caseId", caseId);
    startAI(async () => {
      const res = await generateDocumentDraft(fd);
      if (res.error) setAiError(res.error);
      if (res.content) setContent(res.content);
    });
  }

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
      <form action={action} className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title"><Input name="title" required maxLength={200} /></Field>
          {err("title") && <p className="mt-1 text-xs text-red-600">{err("title")}</p>}
        </div>
        <Field label="Type">
          <Select name="type" defaultValue={TYPES.includes(defaultType ?? "") ? defaultType : "CONTRACT"}>
            {TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}
          </Select>
        </Field>
        <Field label="Client (optional)">
          <Select name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}
          </Select>
        </Field>
        <Field label="Case (optional)">
          <Select name="caseId" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">No case</option>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}
          </Select>
        </Field>
        <input type="hidden" name="content" value={content} />
        <div className="sm:col-span-2">
          <Field label="Initial content (HTML)" hint="Leave empty to start with a blank page.">
            <Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" />
          </Field>
        </div>
        {state.message ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
        <div className="sm:col-span-2"><Submit /></div>
      </form>

      <aside className="h-fit rounded-xl border border-electric/30 bg-electric/5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-electric" /> Write with JUN AI</p>
        <p className="mt-1 text-xs text-muted2">
          Describe the document; JUN AI drafts it using the selected client and case context.
          The AI never signs and never finalizes — you stay in control.
        </p>
        <Textarea
          className="mt-3"
          rows={5}
          placeholder='e.g. "Prepare a refund agreement for a client for $4500 payable in three monthly installments."'
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <Button type="button" variant="primary" className="mt-3 w-full" onClick={writeWithAI} disabled={pendingAI || !instruction.trim()}>
          {pendingAI ? "Drafting…" : "Generate draft"}
        </Button>
        {aiError ? <p className="mt-2 text-xs text-red-600">{aiError}</p> : null}
      </aside>
    </div>
  );
}
