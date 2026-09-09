"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createTask } from "@/services/tasks";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending} className="w-full sm:w-auto">{pending ? "Création…" : "Créer la tâche"}</Button>;
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
    <form action={action} className="grid w-full max-w-3xl min-w-0 gap-4 sm:gap-5 sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2">
        <Field label="Titre"><Input name="title" required maxLength={200} className="min-w-0" /></Field>
        {err("title") ? <p className="mt-1 break-words text-xs text-red-400">{err("title")}</p> : null}
      </div>

      <div className="min-w-0">
        <Field label="Dossier (facultatif)">
          <Select name="caseId" defaultValue={defaultCaseId ?? ""} className="min-w-0">
            <option value="">Aucun dossier</option>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}
          </Select>
        </Field>
      </div>

      <div className="min-w-0">
        <Field label="Client (facultatif)">
          <Select name="clientId" defaultValue={defaultClientId ?? ""} className="min-w-0">
            <option value="">Aucun client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}</option>)}
          </Select>
        </Field>
      </div>

      <div className="min-w-0">
        <Field label="Assignée à">
          <Select name="assigneeId" defaultValue="" className="min-w-0">
            <option value="">Non assignée</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </Select>
        </Field>
      </div>

      <div className="min-w-0">
        <Field label="Priorité">
          <Select name="priority" defaultValue="MEDIUM" className="min-w-0">
            <option value="LOW">Faible</option>
            <option value="MEDIUM">Normale</option>
            <option value="HIGH">Haute</option>
            <option value="URGENT">Urgente</option>
          </Select>
        </Field>
      </div>

      <div className="min-w-0">
        <Field label="Échéance"><Input name="dueDate" type="date" className="min-w-0" /></Field>
      </div>

      <div className="min-w-0">
        <Field label="Statut">
          <Select name="status" defaultValue="TODO" className="min-w-0">
            <option value="TODO">À faire</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="WAITING">En attente</option>
            <option value="DONE">Terminée</option>
            <option value="CANCELLED">Annulée</option>
          </Select>
        </Field>
      </div>

      <div className="min-w-0 sm:col-span-2">
        <Field label="Description"><Textarea name="description" rows={4} className="min-w-0 resize-y" /></Field>
      </div>

      {state.message ? <p className="break-words text-sm text-red-400 sm:col-span-2">{state.message}</p> : null}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
