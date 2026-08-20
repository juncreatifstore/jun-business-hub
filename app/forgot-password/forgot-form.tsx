"use client";
import { useFormState, useFormStatus } from "react-dom";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";
import { Input, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" size="lg" className="w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>;
}

export function ForgotPasswordForm() {
  const [state, action] = useFormState<ForgotPasswordState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Work email"><Input name="email" type="email" autoComplete="email" required /></Field>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.message ? <p className="rounded-lg bg-muted p-3 text-sm">{state.message}</p> : null}
      <Submit />
      <p className="text-center text-xs text-muted2"><Link className="underline" href="/login">Back to sign in</Link></p>
    </form>
  );
}
