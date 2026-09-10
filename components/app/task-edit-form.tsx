"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateTask } from "@/services/tasks";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Enregistrement…" : "Enregistrer la correction"}
    </Button>
  );
}

export function TaskEditForm({
  taskId,
  value,
  users,
  clients,
  cases,
}: {
  taskId: string;
  value: {
    title: string;
    description: string;
    clientId: string;
    caseId: string;
    assigneeId: string;
    priority: string;
    status: string;
    dueDate: string;
  };
  users: { id: string; firstName: string; lastName: string }[];
  clients: { id: string; firstName: string; lastName: string; internalId: string }[];
  cases: { id: string; caseNumber: string; title: string }[];
}) {
  const [state, action] = useFormState(updateTask.bind(null, taskId), {});

  return (
    <form action={action} className="grid w-full max-w-3xl min-w-0 gap-4 sm:gap-5 sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2">
        <Field label="Titre">
          <Input name="title" defaultValue={value.title} required maxLength={200} className="min-w-0" />
        </Field>
      </div>

      <div className="min-w-0">
        <Field label="Client">
          <Select name="clientId" defaultValue={value.clientId} className="min-w-0">
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
        <Field label="Dossier">
          <Select name="caseId" defaultValue={value.caseId} className="min-w-0">
            <option value="">Aucun dossier</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} — {c.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Assignée à">
          <Select name="assigneeId" defaultValue={value.assigneeId} className="min-w-0">
            <option value="">Non assignée</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="min-w-0">
        <Field label="Priorité">
          <Select name="priority" defaultValue={value.priority} className="min-w-0">
            <option value="LOW">Faible</option>
            <option value="MEDIUM">Normale</option>
            <option value="HIGH">Haute</option>
            <option value="URGENT">Urgente</option>
          </Select>
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Statut">
          <Select name="status" defaultValue={value.status} className="min-w-0">
            <option value="TODO">À faire</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="WAITING">En attente</option>
            <option value="DONE">Terminée</option>
            <option value="CANCELLED">Annulée</option>
          </Select>
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Échéance">
          <Input name="dueDate" type="date" defaultValue={value.dueDate} className="min-w-0" />
        </Field>
      </div>

      <div className="min-w-0 sm:col-span-2">
        <Field label="Description">
          <Textarea
            name="description"
            rows={4}
            defaultValue={value.description}
            className="min-w-0 resize-y"
          />
        </Field>
      </div>

      <div className="min-w-0 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4 sm:col-span-2">
        <Field label="Motif de la correction" hint="Obligatoire et conservé dans l’historique d’audit.">
          <Textarea name="correctionReason" rows={3} required className="min-w-0 resize-y" />
        </Field>
      </div>

      {state.message ? (
        <p className="break-words text-sm text-danger sm:col-span-2">{state.message}</p>
      ) : null}
      <div className="sm:col-span-2">
        <Submit />
      </div>
    </form>
  );
}
