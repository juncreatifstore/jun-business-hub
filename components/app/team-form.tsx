"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/services/clients";

const ROLES = [
  "SUPER_ADMIN",
  "DIRECTOR",
  "ADMIN",
  "MANAGER",
  "FINANCE",
  "TRAVEL_AGENT",
  "DOCUMENT_AGENT",
  "LEGAL",
  "ACCOUNTANT",
  "AUDITOR",
  "VIEWER",
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Création…" : "Créer le membre"}
    </Button>
  );
}

export function TeamForm({
  action,
  departments,
  allowSuperAdmin,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  departments: { id: string; label: string }[];
  allowSuperAdmin: boolean;
}) {
  const [state, formAction] = useFormState(action, {});
  const err = (k: string) => state.errors?.[k]?.[0];
  const roles = allowSuperAdmin ? ROLES : ROLES.filter((r) => r !== "SUPER_ADMIN");

  return (
    <form action={formAction} className="grid w-full max-w-3xl min-w-0 gap-4 sm:gap-5 sm:grid-cols-2">
      <div className="min-w-0">
        <Field label="Prénom">
          <Input name="firstName" required autoComplete="given-name" className="min-w-0" />
        </Field>
        {err("firstName") ? (
          <p className="mt-1 break-words text-xs text-red-400">{err("firstName")}</p>
        ) : null}
      </div>
      <div className="min-w-0">
        <Field label="Nom">
          <Input name="lastName" required autoComplete="family-name" className="min-w-0" />
        </Field>
        {err("lastName") ? <p className="mt-1 break-words text-xs text-red-400">{err("lastName")}</p> : null}
      </div>
      <div className="min-w-0">
        <Field label="Email">
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className="min-w-0"
          />
        </Field>
        {err("email") ? <p className="mt-1 break-words text-xs text-red-400">{err("email")}</p> : null}
      </div>
      <div className="min-w-0">
        <Field label="Téléphone (facultatif)">
          <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" className="min-w-0" />
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Rôle">
          <Select name="role" defaultValue="VIEWER" className="min-w-0">
            {roles.map((r) => (
              <option key={r} value={r}>
                {r.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        {err("role") ? <p className="mt-1 break-words text-xs text-red-400">{err("role")}</p> : null}
      </div>
      <div className="min-w-0">
        <Field label="Département (facultatif)">
          <Select name="departmentId" defaultValue="" className="min-w-0">
            <option value="">— Aucun —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        {err("departmentId") ? (
          <p className="mt-1 break-words text-xs text-red-400">{err("departmentId")}</p>
        ) : null}
      </div>
      <div className="min-w-0 sm:col-span-2">
        <Field
          label="Mot de passe temporaire"
          hint="Minimum 10 caractères. Demandez au membre de le modifier après sa première connexion."
        >
          <Input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="min-w-0"
          />
        </Field>
        {err("password") ? <p className="mt-1 break-words text-xs text-red-400">{err("password")}</p> : null}
      </div>
      <div className="sm:col-span-2">
        <Submit />
      </div>
    </form>
  );
}
