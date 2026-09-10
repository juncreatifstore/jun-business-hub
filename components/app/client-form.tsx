"use client";
import { useFormState, useFormStatus } from "react-dom";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/services/clients";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Enregistrement…" : label}
    </Button>
  );
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
    <form action={formAction} className="grid w-full min-w-0 max-w-3xl gap-4 sm:grid-cols-2 sm:gap-5">
      <div className="min-w-0">
        <Field label="Prénom">
          <Input name="firstName" defaultValue={defaults?.firstName} required />
        </Field>
        {err("firstName") && <p className="mt-1 text-xs text-red-600">{err("firstName")}</p>}
      </div>
      <div className="min-w-0">
        <Field label="Nom">
          <Input name="lastName" defaultValue={defaults?.lastName} required />
        </Field>
        {err("lastName") && <p className="mt-1 text-xs text-red-600">{err("lastName")}</p>}
      </div>
      <div className="min-w-0">
        <Field label="Email">
          <Input name="email" type="email" defaultValue={defaults?.email} />
        </Field>
        {err("email") && <p className="mt-1 text-xs text-red-600">{err("email")}</p>}
      </div>
      <div className="min-w-0">
        <Field label="Téléphone">
          <Input name="phone" inputMode="tel" defaultValue={defaults?.phone} />
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="WhatsApp">
          <Input name="whatsapp" inputMode="tel" defaultValue={defaults?.whatsapp} />
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Pays">
          <Input name="country" defaultValue={defaults?.country} />
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Nationalité">
          <Input name="nationality" defaultValue={defaults?.nationality} />
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Date de naissance">
          <Input name="birthDate" type="date" defaultValue={defaults?.birthDate} />
        </Field>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <Field label="Adresse">
          <Input name="address" defaultValue={defaults?.address} />
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Statut">
          <Select name="status" defaultValue={defaults?.status ?? "ACTIVE"}>
            <option value="LEAD">Prospect</option>
            <option value="ACTIVE">Actif</option>
            <option value="INACTIVE">Inactif</option>
            <option value="ARCHIVED">Archivé</option>
          </Select>
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Tags" hint="Séparés par des virgules, ex. vip, voyage">
          <Input name="tags" defaultValue={defaults?.tags} />
        </Field>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <Field label="Notes">
          <Textarea name="notes" rows={4} defaultValue={defaults?.notes} />
        </Field>
      </div>
      {state.message ? (
        <p className="break-words text-sm text-red-600 sm:col-span-2">{state.message}</p>
      ) : null}
      <div className="sm:col-span-2">
        <Submit label={submitLabel} />
      </div>
    </form>
  );
}
