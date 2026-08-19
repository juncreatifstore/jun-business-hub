"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createTask } from "@/services/tasks";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Creating…" : "Create task"}</Button>;
}

export function TaskForm({
  clients, cases, users, defaultCaseId, defaultClientId,
}: {
  clients: { id: string; firstName: string; lastName: string }[];
  cases: { id: string; caseNumber: string; title: string }[];
  users: { id: string; firstName: string; lastName: string }[];
  defaultCaseId?: string;
  defaultClientId?: string;
}) {
  const [state, action] = useFormState(createTask, {});
  const err = (k: string) => state.errors?.[k]?.[0];
  return (
    <form action={action} className="grid max-w-3xl gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Title"><Input name="title" required maxLength={200} /></Field>
        {err("title") && <p className="mt-1 text-xs text-red-600">{err("title")}</p>}
      </div>
      <Field label="Case (optional)">
        <Select name="caseId" defaultValue={defaultCaseId ?? ""}>
          <option value="">No case</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}
        </Select>
      </Field>
      <Field label="Client (optional)">
        <Select name="clientId" defaultValue={defaultClientId ?? ""}>
          <option value="">No client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}</option>)}
        </Select>
      </Field>
      <Field label="Assignee">
        <Select name="assigneeId" defaultValue="">
          <option value="">Unassigned</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </Select>
      </Field>
      <Field label="Priority">
        <Select name="priority" defaultValue="MEDIUM">
          <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option><option value="URGENT">Urgent</option>
        </Select>
      </Field>
      <Field label="Due date"><Input name="dueDate" type="date" /></Field>
      <Field label="Status">
        <Select name="status" defaultValue="TODO">
          {["TODO","IN_PROGRESS","WAITING","DONE","CANCELLED"].map((s) => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description"><Textarea name="description" rows={4} /></Field>
      </div>
      {state.message ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
