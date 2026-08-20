"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FieldMeta = {
  el: HTMLElement;
  name: string;
  type: string;
  required: boolean;
  help: string;
  options: string[];
  order: number;
  formula: string;
};

function numberValue(value: unknown): number {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function evalSimpleFormula(formula: string, values: Record<string, string | boolean>): string {
  const tokens = formula.match(/[A-Za-z_][A-Za-z0-9_.-]*|\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens || tokens.length === 0) return "";
  const normalized = tokens.map((token) => {
    if (/^\d/.test(token) || /^[()+\-*/]$/.test(token)) return token;
    return String(numberValue(values[token]));
  });
  const expression = normalized.join(" ");
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) return "";
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expression});`)();
    return Number.isFinite(Number(result)) ? String(Number(result)) : "";
  } catch {
    return "";
  }
}

function valueLabel(value: string | boolean | undefined, type: string): string {
  if (type === "CHECKBOX") return value === true ? "✓ Yes" : "☐ No";
  return String(value ?? "").trim();
}

export function DocumentFillPreview({
  documentId,
  title,
  html,
  createFilledCopy,
  serverError,
}: {
  documentId: string;
  title: string;
  html: string;
  createFilledCopy: (formData: FormData) => Promise<void>;
  serverError?: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const valuesRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [current, setCurrent] = useState(0);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const found = Array.from(root.querySelectorAll<HTMLElement>('[data-jun-field="true"]'))
      .map((el) => ({
        el,
        name: el.dataset.fieldName || "Field",
        type: (el.dataset.fieldType || "TEXT").toUpperCase(),
        required: el.dataset.required === "true",
        help: el.dataset.help || "",
        options: (el.dataset.options || "").split(",").map((x) => x.trim()).filter(Boolean),
        order: Number(el.dataset.order || 0),
        formula: el.dataset.formula || "",
      }))
      .sort((a, b) => a.order - b.order);

    for (const field of found) {
      field.el.innerHTML = "";
      field.el.removeAttribute("style");
      field.el.className = "jun-fill-field my-3 rounded-lg border border-slate-200 bg-slate-50 p-3";
      const label = document.createElement("label");
      label.className = "mb-1 block text-sm font-semibold text-slate-800";
      label.textContent = `${field.order ? `#${field.order} ` : ""}${field.name}${field.required ? " *" : ""}`;
      field.el.append(label);
      if (field.help) {
        const help = document.createElement("p");
        help.className = "mb-2 text-xs text-slate-500";
        help.textContent = field.help;
        field.el.append(help);
      }

      const update = (value: string | boolean) => setValues((prev) => ({ ...prev, [field.name]: value }));
      let control: HTMLElement;
      if (field.type === "DROPDOWN") {
        const select = document.createElement("select");
        select.className = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
        const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Select…"; select.append(empty);
        field.options.forEach((option) => { const o = document.createElement("option"); o.value = option; o.textContent = option; select.append(o); });
        select.onchange = () => update(select.value); control = select;
      } else if (field.type === "RADIO") {
        const wrap = document.createElement("div"); wrap.className = "flex flex-wrap gap-3";
        field.options.forEach((option) => {
          const l = document.createElement("label"); l.className = "inline-flex items-center gap-1 text-sm";
          const radio = document.createElement("input"); radio.type = "radio"; radio.name = `field-${field.order}-${field.name}`; radio.value = option;
          radio.onchange = () => update(option); l.append(radio, document.createTextNode(option)); wrap.append(l);
        }); control = wrap;
      } else if (field.type === "CHECKBOX") {
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.className = "h-5 w-5";
        checkbox.onchange = () => update(checkbox.checked); control = checkbox;
      } else if (field.type === "FORMULA") {
        const input = document.createElement("input"); input.readOnly = true; input.dataset.formulaField = field.name; input.className = "w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium"; control = input;
      } else if (field.type === "IMAGE") {
        const input = document.createElement("input"); input.type = "file"; input.accept = "image/png,image/jpeg,image/webp"; input.className = "w-full text-sm";
        input.onchange = () => update(input.files?.[0]?.name || ""); control = input;
      } else {
        const input = document.createElement("input");
        input.type = field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text";
        input.placeholder = field.type === "SIGNATURE" ? "Type signer name" : field.type === "INITIALS" ? "Initials" : field.name;
        input.className = `w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ${field.type === "SIGNATURE" ? "italic" : ""}`;
        input.oninput = () => update(input.value); control = input;
      }
      control.setAttribute("data-fill-control", "true");
      field.el.append(control);
    }
    setFields(found);
  }, [html]);

  useEffect(() => {
    for (const field of fields) {
      if (field.type !== "FORMULA") continue;
      const result = evalSimpleFormula(field.formula, values);
      const input = field.el.querySelector<HTMLInputElement>("input[data-formula-field]");
      if (input) input.value = result;
    }
  }, [fields, values]);

  const completed = useMemo(() => fields.filter((field) => {
    if (field.type === "FORMULA") return true;
    const value = values[field.name];
    return typeof value === "boolean" ? value : Boolean(String(value ?? "").trim());
  }).length, [fields, values]);

  function focusField(index: number) {
    if (!fields.length) return;
    const next = Math.max(0, Math.min(fields.length - 1, index));
    setCurrent(next);
    fields[next].el.scrollIntoView({ behavior: "smooth", block: "center" });
    fields[next].el.querySelector<HTMLElement>("[data-fill-control=true], input, select")?.focus();
  }

  function missingRequired(): string[] {
    return fields
      .filter((field) => field.required && field.type !== "FORMULA" && !(field.type === "CHECKBOX" ? values[field.name] === true : String(values[field.name] ?? "").trim()))
      .map((field) => field.name);
  }

  function validate(): boolean {
    const missing = missingRequired();
    setErrors(missing);
    if (missing.length) {
      const first = fields.findIndex((field) => field.name === missing[0]);
      if (first >= 0) focusField(first);
      return false;
    }
    setErrors([]);
    return true;
  }

  function buildFilledHtml(): string {
    const root = rootRef.current;
    if (!root) return "";
    const clone = root.cloneNode(true) as HTMLElement;
    const clonedFields = Array.from(clone.querySelectorAll<HTMLElement>('[data-jun-field="true"]'));
    for (const el of clonedFields) {
      const name = el.dataset.fieldName || "Field";
      const type = (el.dataset.fieldType || "TEXT").toUpperCase();
      let output = "";
      if (type === "FORMULA") {
        const original = fields.find((f) => f.name === name && f.type === "FORMULA");
        output = original?.el.querySelector<HTMLInputElement>("input[data-formula-field]")?.value ?? "";
      } else {
        output = valueLabel(values[name], type);
      }
      el.removeAttribute("data-jun-field");
      el.removeAttribute("data-jun-block");
      el.removeAttribute("data-kind");
      el.removeAttribute("data-field-type");
      el.removeAttribute("data-field-name");
      el.removeAttribute("data-required");
      el.removeAttribute("data-help");
      el.removeAttribute("data-options");
      el.removeAttribute("data-order");
      el.removeAttribute("data-validation");
      el.removeAttribute("data-formula");
      el.removeAttribute("style");
      el.removeAttribute("class");
      el.innerHTML = "";
      const label = document.createElement("strong");
      label.textContent = `${name}: `;
      el.append(label, document.createTextNode(output || "—"));
    }
    clone.querySelectorAll("input, select, button").forEach((el) => el.remove());
    return clone.innerHTML;
  }

  function createCopy() {
    if (!validate()) return;
    const frozen = buildFilledHtml();
    if (!frozen.trim()) {
      window.alert("The filled document could not be prepared.");
      return;
    }
    if (valuesRef.current) valuesRef.current.value = JSON.stringify(values);
    if (htmlRef.current) htmlRef.current.value = frozen;
    setCreating(true);
    formRef.current?.requestSubmit();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/app/documents/${documentId}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric"><ArrowLeft className="h-4 w-4" />Back to document</Link>
        <div className="text-xs text-muted2">{completed}/{fields.length} fields completed</div>
      </div>
      <div className="mb-4 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold">Preview / Fill</p><p className="text-xs text-muted2">{title} · Required fields must be completed before creating a filled copy.</p></div>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => focusField(current - 1)} disabled={current <= 0}>Previous</Button><Button type="button" variant="outline" onClick={() => focusField(current + 1)} disabled={current >= fields.length - 1}>Next <ArrowRight className="ml-1 h-4 w-4" /></Button><Button type="button" variant="outline" onClick={() => validate()}><CheckCircle2 className="mr-1.5 h-4 w-4" />Validate</Button></div>
        </div>
        {(errors.length || serverError) ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{serverError || `Required: ${errors.join(", ")}`}</span></div> : null}
        <form ref={formRef} action={createFilledCopy} className="mt-4 flex flex-wrap items-end gap-3">
          <input ref={valuesRef} type="hidden" name="values" />
          <input ref={htmlRef} type="hidden" name="filledHtml" />
          <div className="min-w-64 flex-1"><Input name="copyTitle" placeholder={`${title} — Filled copy`} maxLength={180} /><p className="mt-1 text-xs text-muted2">Optional: give the new independent document a different title.</p></div>
          <Button type="button" variant="primary" disabled={creating || fields.length === 0} onClick={createCopy}><CopyPlus className="mr-1.5 h-4 w-4" />{creating ? "Creating…" : "Create filled copy"}</Button>
        </form>
      </div>
      {fields.length === 0 ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">This document has no fillable fields yet. Add fields in the Document Editor first.</div> : null}
      <div className="mx-auto max-w-[850px] rounded-xl border border-line bg-white shadow-sm"><div ref={rootRef} className="doc-prose min-h-[900px] px-12 py-10 text-[15px] text-night" dangerouslySetInnerHTML={{ __html: html }} /></div>
    </div>
  );
}
