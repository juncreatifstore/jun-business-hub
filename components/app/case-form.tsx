"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createCase } from "@/services/cases";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Création…" : "Créer le dossier"}
    </Button>
  );
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
    <form action={action} className="grid w-full min-w-0 max-w-3xl gap-4 sm:grid-cols-2 sm:gap-5">
      <div className="min-w-0 sm:col-span-2">
        <Field label="Client">
          <Select name="clientId" defaultValue={defaultClientId ?? ""} required>
            <option value="" disabled>
              Sélectionner un client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName}, {c.firstName} — {c.internalId}
              </option>
            ))}
          </Select>
        </Field>
        {err("clientId") && <p className="mt-1 text-xs text-red-600">{err("clientId")}</p>}
      </div>
      <div className="min-w-0 sm:col-span-2">
        <Field label="Titre">
          <Input name="title" required maxLength={200} />
        </Field>
        {err("title") && <p className="mt-1 text-xs text-red-600">{err("title")}</p>}
      </div>
      <div className="min-w-0">
        <Field label="Type" hint="Ex. Visa, Voyage, Remboursement, Documents">
          <Input name="type" required maxLength={80} defaultValue="Travel" />
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Priorité">
          <Select name="priority" defaultValue="MEDIUM">
            <option value="LOW">Basse</option>
            <option value="MEDIUM">Moyenne</option>
            <option value="HIGH">Haute</option>
            <option value="URGENT">Urgente</option>
          </Select>
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Statut">
          <Select name="status" defaultValue="OPEN">
            <option value="OPEN">Ouvert</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="WAITING_CLIENT">Attente client</option>
            <option value="WAITING_INTERNAL">Attente interne</option>
            <option value="COMPLETED">Terminé</option>
            <option value="CANCELLED">Annulé</option>
            <option value="ARCHIVED">Archivé</option>
          </Select>
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Échéance">
          <Input name="dueDate" type="date" />
        </Field>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <Field label="Tags" hint="Séparés par des virgules">
          <Input name="tags" />
        </Field>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <Field label="Description">
          <Textarea name="description" rows={4} />
        </Field>
      </div>
      {state.message ? (
        <p className="break-words text-sm text-red-600 sm:col-span-2">{state.message}</p>
      ) : null}
      <div className="sm:col-span-2">
        <Submit />
      </div>
    </form>
  );
}
