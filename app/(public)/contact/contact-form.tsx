"use client";
import { useFormState, useFormStatus } from "react-dom";
import { submitContact, type ContactState } from "./actions";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

const initial: ContactState = { ok: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" size="lg" disabled={pending}>
      {pending ? "Sending…" : "Send message"}
    </Button>
  );
}

function Err({ errors, name }: { errors?: Record<string, string[]>; name: string }) {
  const e = errors?.[name]?.[0];
  return e ? <p className="mt-1 text-xs text-red-600">{e}</p> : null;
}

export function ContactForm() {
  const [state, action] = useFormState(submitContact, initial);

  if (state.ok) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        <p className="text-sm text-emerald-800">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div>
        <Field label="First name"><Input name="firstName" required maxLength={80} /></Field>
        <Err errors={state.errors} name="firstName" />
      </div>
      <div>
        <Field label="Last name"><Input name="lastName" required maxLength={80} /></Field>
        <Err errors={state.errors} name="lastName" />
      </div>
      <div>
        <Field label="Email"><Input name="email" type="email" required maxLength={160} /></Field>
        <Err errors={state.errors} name="email" />
      </div>
      <Field label="Phone (optional)"><Input name="phone" maxLength={40} /></Field>
      <div className="sm:col-span-2">
        <Field label="Subject"><Input name="subject" required maxLength={200} /></Field>
        <Err errors={state.errors} name="subject" />
      </div>
      <Field label="Department">
        <Select name="department" defaultValue="CUSTOMER_SERVICE">
          <option value="CUSTOMER_SERVICE">Customer service</option>
          <option value="TRAVEL">Travel</option>
          <option value="DOCUMENTS">Documents</option>
          <option value="FINANCE">Finance</option>
          <option value="LEGAL">Legal</option>
          <option value="ADMINISTRATION">Administration</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Message"><Textarea name="message" required rows={6} maxLength={5000} /></Field>
        <Err errors={state.errors} name="message" />
      </div>
      {state.message && !state.ok ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
