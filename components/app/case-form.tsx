"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createCase } from "@/services/cases";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Creating…" : "Create case"}</Button>;
}

export function CaseForm({
  clients,
  defaultClientId,
}: {
  clients: { id: string; firstName: string; lastName: string; internalId: string }[];
  defaultClientId?: string;
}) {
  const [state, action] = useFormState(createCase, {});
  const err = (k: string) => state.errors?.[k]?.[0];
  return (
    <form action={action} className="grid max-w-3xl gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Client">
          <Select name="clientId" defaultValue={defaultClientId ?? ""} required>
            <option value="" disabled>Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>
            ))}
          </Select>
        </Field>
        {err("clientId") && <p className="mt-1 text-xs text-red-600">{err("clientId")}</p>}
      </div>
      <div className="sm:col-span-2">
        <Field label="Title"><Input name="title" required maxLength={200} /></Field>
        {err("title") && <p className="mt-1 text-xs text-red-600">{err("title")}</p>}
      </div>
      <Field label="Type" hint="e.g. Visa, Travel, Refund, Documents">
        <Input name="type" required maxLength={80} defaultValue="Travel" />
      </Field>
      <Field label="Priority">
        <Select name="priority" defaultValue="MEDIUM">
          <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option><option value="URGENT">Urgent</option>
        </Select>
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue="OPEN">
          {["OPEN","IN_PROGRESS","WAITING_CLIENT","WAITING_INTERNAL","COMPLETED","CANCELLED","ARCHIVED"].map((s) => (
            <option key={s} value={s}>{s.replaceAll("_"," ")}</option>
          ))}
        </Select>
      </Field>
      <Field label="Due date"><Input name="dueDate" type="date" /></Field>
      <Field label="Tags" hint="Comma-separated"><Input name="tags" /></Field>
      <div className="sm:col-span-2">
        <Field label="Description"><Textarea name="description" rows={4} /></Field>
      </div>
      {state.message ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
