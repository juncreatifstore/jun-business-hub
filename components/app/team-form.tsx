"use client";
import { useFormState, useFormStatus } from "react-dom";
import { Input, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/services/clients";

const ROLES = ["SUPER_ADMIN", "DIRECTOR", "ADMIN", "MANAGER", "FINANCE", "TRAVEL_AGENT", "DOCUMENT_AGENT", "LEGAL", "ACCOUNTANT", "AUDITOR", "VIEWER"];

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Creating…" : "Create member"}</Button>;
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
    <form action={formAction} className="grid gap-5 sm:grid-cols-2">
      <div>
        <Field label="First name"><Input name="firstName" required /></Field>
        {err("firstName") && <p className="mt-1 text-xs text-red-500">{err("firstName")}</p>}
      </div>
      <div>
        <Field label="Last name"><Input name="lastName" required /></Field>
        {err("lastName") && <p className="mt-1 text-xs text-red-500">{err("lastName")}</p>}
      </div>
      <div>
        <Field label="Email"><Input name="email" type="email" required /></Field>
        {err("email") && <p className="mt-1 text-xs text-red-500">{err("email")}</p>}
      </div>
      <div>
        <Field label="Phone (optional)"><Input name="phone" /></Field>
      </div>
      <div>
        <Field label="Role">
          <Select name="role" defaultValue="VIEWER">
            {roles.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}
          </Select>
        </Field>
        {err("role") && <p className="mt-1 text-xs text-red-500">{err("role")}</p>}
      </div>
      <div>
        <Field label="Department (optional)">
          <Select name="departmentId" defaultValue="">
            <option value="">— None —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </Select>
        </Field>
        {err("departmentId") && <p className="mt-1 text-xs text-red-500">{err("departmentId")}</p>}
      </div>
      <div className="sm:col-span-2">
        <Field label="Temporary password" hint="Minimum 10 characters. Ask the member to change it after first login.">
          <Input name="password" type="password" required minLength={10} />
        </Field>
        {err("password") && <p className="mt-1 text-xs text-red-500">{err("password")}</p>}
      </div>
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
