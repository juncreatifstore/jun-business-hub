"use client";
import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Select, Field, Input } from "@/components/ui/input";
import { UploadCloud } from "lucide-react";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      <UploadCloud className="mr-2 h-4 w-4" />
      {pending ? "Uploading…" : "Upload"}
    </Button>
  );
}

export function FileUploadForm({
  action,
  isVault = false,
  categories,
  vaultCategories,
  clients,
  cases,
}: {
  action: (formData: FormData) => Promise<void>;
  isVault?: boolean;
  categories: string[];
  vaultCategories?: readonly string[];
  clients?: { id: string; label: string }[];
  cases?: { id: string; label: string }[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="isVault" value={isVault ? "1" : "0"} />
      <div className="lg:col-span-2">
        <Field label="File">
          <Input ref={fileRef} type="file" name="file" required className="file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-sm file:text-white" />
        </Field>
      </div>
      {isVault && vaultCategories ? (
        <Field label="Vault category">
          <Select name="vaultCategory" required>
            {vaultCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      ) : (
        <Field label="Category">
          <Select name="category" defaultValue="OTHER">
            {categories.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
      )}
      {!isVault && clients ? (
        <Field label="Link to client (optional)">
          <Select name="clientId" defaultValue="">
            <option value="">— None —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
      ) : null}
      {!isVault && cases ? (
        <Field label="Link to case (optional)">
          <Select name="caseId" defaultValue="">
            <option value="">— None —</option>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
      ) : null}
      <div className="flex items-end"><SubmitBtn /></div>
    </form>
  );
}
