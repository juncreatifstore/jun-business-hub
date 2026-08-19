"use client";
import { useFormState, useFormStatus } from "react-dom";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/services/clients";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Saving…" : label}</Button>;
}

export function ClientForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: Partial<Record<string, string>>;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState(action, {});
  const err = (k: string) => state.errors?.[k]?.[0];
  return (
    <form action={formAction} className="grid max-w-3xl gap-5 sm:grid-cols-2">
      <div>
        <Field label="First name"><Input name="firstName" defaultValue={defaults?.firstName} required /></Field>
        {err("firstName") && <p className="mt-1 text-xs text-red-600">{err("firstName")}</p>}
      </div>
      <div>
        <Field label="Last name"><Input name="lastName" defaultValue={defaults?.lastName} required /></Field>
        {err("lastName") && <p className="mt-1 text-xs text-red-600">{err("lastName")}</p>}
      </div>
      <div>
        <Field label="Email"><Input name="email" type="email" defaultValue={defaults?.email} /></Field>
        {err("email") && <p className="mt-1 text-xs text-red-600">{err("email")}</p>}
      </div>
      <Field label="Phone"><Input name="phone" defaultValue={defaults?.phone} /></Field>
      <Field label="WhatsApp"><Input name="whatsapp" defaultValue={defaults?.whatsapp} /></Field>
      <Field label="Country"><Input name="country" defaultValue={defaults?.country} /></Field>
      <Field label="Nationality"><Input name="nationality" defaultValue={defaults?.nationality} /></Field>
      <Field label="Birth date"><Input name="birthDate" type="date" defaultValue={defaults?.birthDate} /></Field>
      <div className="sm:col-span-2">
        <Field label="Address"><Input name="address" defaultValue={defaults?.address} /></Field>
      </div>
      <Field label="Status">
        <Select name="status" defaultValue={defaults?.status ?? "ACTIVE"}>
          <option value="LEAD">Lead</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </Field>
      <Field label="Tags" hint="Comma-separated, e.g. vip, travel">
        <Input name="tags" defaultValue={defaults?.tags} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes"><Textarea name="notes" rows={4} defaultValue={defaults?.notes} /></Field>
      </div>
      {state.message ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
      <div className="sm:col-span-2"><Submit label={submitLabel} /></div>
    </form>
  );
}
