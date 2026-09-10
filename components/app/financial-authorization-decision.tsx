"use client";
import { useFormState, useFormStatus } from "react-dom";
import { submitFinancialAuthorizationDecision } from "@/services/financial-authorization-feedback";

function Decisions({ singleAdmin }: { singleAdmin: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        name="decision"
        value="APPROVE"
        disabled={pending}
        className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm text-ink disabled:opacity-50"
      >
        {pending ? "Enregistrement…" : "Approuver"}
      </button>
      {!singleAdmin && (
        <button
          name="decision"
          value="REJECT"
          disabled={pending}
          className="min-h-11 rounded-lg bg-red-700 px-3 text-sm text-ink disabled:opacity-50"
        >
          Rejeter
        </button>
      )}
    </div>
  );
}
export function FinancialAuthorizationDecision({
  id,
  requester,
  alreadyDecided,
  singleAdminAllowed = false,
}: {
  id: string;
  requester: boolean;
  alreadyDecided: boolean;
  singleAdminAllowed?: boolean;
}) {
  const [state, action] = useFormState(submitFinancialAuthorizationDecision.bind(null, id), {
    message: "",
    success: false,
  });
  if (requester && !singleAdminAllowed)
    return (
      <p className="max-w-xs text-xs leading-relaxed text-warning">
        Vous êtes le demandeur. Un autre Super Admin doit approuver ou rejeter cette demande.
      </p>
    );
  if (alreadyDecided)
    return (
      <p className="max-w-xs text-xs leading-relaxed text-muted2">
        Votre décision est enregistrée. En attente des autres approbations requises.
      </p>
    );
  return (
    <form action={action} className="min-w-0 space-y-2">
      <label className="block text-xs">
        Note ou motif de rejet
        <input
          name="note"
          maxLength={1000}
          required={requester}
          minLength={requester ? 10 : undefined}
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base"
        />
      </label>
      {requester && (
        <label className="flex max-w-xs items-start gap-2 text-xs text-warning">
          <input type="checkbox" name="singleAdminConfirmation" required className="mt-1" />
          <span>
            Je confirme cette validation exceptionnelle en tant qu’unique Super Admin actif. Motif obligatoire
            (10 caractères minimum) ; décision inscrite au journal d’audit.
          </span>
        </label>
      )}
      {!state.success && <Decisions singleAdmin={requester} />}
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={`max-w-xs text-xs ${state.success ? "text-success" : "text-danger"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
