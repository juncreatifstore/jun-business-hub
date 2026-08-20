"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { BUILTIN_TEMPLATE_VARIABLES, TEMPLATE_CATEGORIES } from "@/lib/document-template-constants";
import { Code2, Eye, PlusCircle } from "lucide-react";

const TYPES = ["CONTRACT","AGREEMENT","REFUND_AGREEMENT","RECEIPT","INVOICE","LETTER","ATTESTATION","AUTHORIZATION","REPORT","CUSTOM"];

type InitialTemplate = {
  name?: string;
  type?: string;
  category?: string;
  language?: string;
  description?: string | null;
  content?: string;
  variables?: unknown;
  isActive?: boolean;
};

function keysFrom(content: string) {
  return [...new Set(Array.from(content.matchAll(/\{\{\s*([a-zA-Z0-9_.-]{1,80})\s*\}\}/g)).map((m) => m[1]))];
}

export function DocumentTemplateForm({ action, initial, submitLabel = "Save template" }: { action: (formData: FormData) => Promise<void>; initial?: InitialTemplate; submitLabel?: string }) {
  const [content, setContent] = useState(initial?.content ?? `<h1>{{document.title}}</h1>\n<p></p>`);
  const [preview, setPreview] = useState(false);
  const detected = useMemo(() => keysFrom(content), [content]);
  const prior = Array.isArray(initial?.variables) ? initial?.variables : [];
  const priorMap = new Map((prior as Array<Record<string, unknown>>).map((v) => [String(v.key ?? ""), v]));
  const variables = detected.map((key) => {
    const old = priorMap.get(key);
    const builtin = BUILTIN_TEMPLATE_VARIABLES.find((v) => v.key === key);
    return {
      key,
      label: String(old?.label ?? builtin?.label ?? key),
      required: Boolean(old?.required ?? !builtin?.automatic),
      automatic: Boolean(old?.automatic ?? builtin?.automatic ?? false),
      defaultValue: String(old?.defaultValue ?? ""),
    };
  });

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    setContent((current) => `${current}${current.endsWith("\n") ? "" : "\n"}${token}`);
  }

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-5">
        <section className="grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Template name"><Input name="name" required maxLength={200} defaultValue={initial?.name ?? ""} /></Field></div>
          <Field label="Document type"><Select name="type" defaultValue={initial?.type ?? "CUSTOM"}>{TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}</Select></Field>
          <Field label="Language"><Select name="language" defaultValue={initial?.language ?? "FR"}><option>FR</option><option>EN</option><option>ES</option><option>HT</option></Select></Field>
          <div className="sm:col-span-2"><Field label="Category"><Select name="category" defaultValue={initial?.category ?? "GENERAL"}>{TEMPLATE_CATEGORIES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select></Field></div>
          <div className="sm:col-span-2"><Field label="Description"><Textarea name="description" rows={3} maxLength={2000} defaultValue={initial?.description ?? ""} placeholder="When should this template be used?" /></Field></div>
          <label className="sm:col-span-2 flex items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm"><input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? false} /><span><strong>Active template</strong><br/><span className="text-xs text-muted2">Active templates appear in New document.</span></span></label>
        </section>

        <section className="rounded-xl border border-line bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Template content</p><p className="text-xs text-muted2">Use clean HTML and insert variables with double braces.</p></div><Button type="button" variant="outline" onClick={() => setPreview((v) => !v)}>{preview ? <><Code2 className="mr-1.5 h-4 w-4"/>Edit HTML</> : <><Eye className="mr-1.5 h-4 w-4"/>Preview</>}</Button></div>
          {preview ? <div className="doc-prose min-h-[420px] rounded-xl border border-line bg-white p-6" dangerouslySetInnerHTML={{ __html: content }} /> : <Textarea name="content" rows={24} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" required />}
          {preview ? <input type="hidden" name="content" value={content} /> : null}
          <input type="hidden" name="variablesJson" value={JSON.stringify(variables)} />
          <div className="mt-4 flex flex-wrap gap-2"><Button type="submit" variant="primary">{submitLabel}</Button><a href="/app/documents/templates" className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface">Cancel</a></div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <section className="rounded-xl border border-electric/30 bg-electric/5 p-4"><p className="font-semibold">Dynamic variables</p><p className="mt-1 text-xs text-muted2">Click to append a variable token. Automatic variables are filled from the selected client, case or current date.</p><div className="mt-3 max-h-[360px] space-y-1 overflow-auto">{BUILTIN_TEMPLATE_VARIABLES.map((v) => <button type="button" key={v.key} onClick={() => insertVariable(v.key)} className="flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-left text-xs hover:border-electric"><span><strong>{v.label}</strong><br/><code className="text-[10px] text-muted2">{`{{${v.key}}}`}</code></span><PlusCircle className="h-4 w-4 text-electric" /></button>)}</div></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="font-semibold">Detected variables</p>{variables.length ? <ul className="mt-3 space-y-2">{variables.map((v) => <li key={v.key} className="rounded-lg bg-surface p-2 text-xs"><code>{`{{${v.key}}}`}</code><p className="mt-1 text-muted2">{v.automatic ? "Automatic" : v.required ? "Required input" : "Optional input"}</p></li>)}</ul> : <p className="mt-2 text-xs text-muted2">No variables detected.</p>}</section>
      </aside>
    </form>
  );
}
