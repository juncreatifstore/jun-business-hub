"use client";
import { useFormState, useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";
import { Input, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useFormState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Work email"><Input name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <Submit />
      <p className="text-center text-xs text-muted2">
        Forgot your password? Ask an administrator to reset it from Team.
      </p>
    </form>
  );
}
