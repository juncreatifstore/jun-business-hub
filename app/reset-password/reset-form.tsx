"use client";
import { useFormState, useFormStatus } from "react-dom";
import { resetPassword, type ResetPasswordState } from "./actions";
import { Input, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" size="lg" className="w-full" disabled={pending}>{pending ? "Updating…" : "Set new password"}</Button>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState<ResetPasswordState, FormData>(resetPassword, {});
  if (state.success) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-muted p-3 text-sm">Your password has been changed. All previous sessions were signed out.</p>
        <Button asChild variant="primary" size="lg" className="w-full"><Link href="/login">Sign in</Link></Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="New password"><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <Field label="Confirm password"><Input name="confirm" type="password" autoComplete="new-password" minLength={10} required /></Field>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <Submit />
      <p className="text-center text-xs text-muted2"><Link className="underline" href="/login">Back to sign in</Link></p>
    </form>
  );
}
