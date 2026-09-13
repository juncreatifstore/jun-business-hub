import Link from "next/link";
import { AlertTriangle, CheckCircle2, CreditCard, FileUp, Undo2, ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requestUrl, parseItems, docLabel } from "@/lib/document-requests";
import { paymentRequestUrl } from "@/lib/payment-requests";
import { claimUrl } from "@/lib/refund-claims";
import { caseChecklist } from "@/lib/document-requirements";
import { DOC_TYPE_LABELS } from "@/lib/file-extraction";
import { startClientRefund } from "@/services/client-portal";

/** "À faire" for the connected client: open document/payment/refund requests and case checklists. */
export async function PortalActions({ clientId }: { clientId: string }) {
  const [docReqs, payReqs, claims, cases] = await Promise.all([
    prisma.documentRequest.findMany({
      where: { clientId, status: { in: ["PENDING", "PARTIAL"] }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.paymentRequest.findMany({
      where: { clientId, status: { in: ["SENT", "VIEWED"] }, expiresAt: { gt: new Date() } },
      orderBy: { dueAt: "asc" },
    }),
    prisma.refundClaim.findMany({
      where: { clientId, status: { in: ["SENT", "SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO", "CONVERTED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.case.findMany({
      where: { clientId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"] } },
      select: { id: true, caseNumber: true, title: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const checklists = await Promise.all(
    cases.map(async (c) => ({ c, cl: await caseChecklist(c.id).catch(() => null) })),
  );
  const todo =
    docReqs.length +
    payReqs.length +
    claims.filter((c) => c.status === "SENT" || c.status === "NEEDS_INFO").length;

  return (
    <div className="space-y-6">
      <Card className={todo ? "border-amber-300/40" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {todo ? (
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
            {todo
              ? `${todo} action${todo > 1 ? "s" : ""} attendue${todo > 1 ? "s" : ""} de votre part`
              : "Rien en attente de votre part"}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-white/5">
          {payReqs.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <CreditCard className="h-4 w-4 text-amber-300" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  Paiement de {r.currency} {Number(r.amount).toFixed(2)} — {r.description}
                </div>
                <div className="text-xs text-white/50">
                  {r.dueAt ? `Avant le ${r.dueAt.toLocaleDateString("fr-FR")}` : "Dès que possible"}
                </div>
              </div>
              <Link
                href={paymentRequestUrl(r.token)}
                className="rounded-lg bg-electric px-3 py-1.5 text-xs font-medium text-white"
              >
                Payer / envoyer la preuve
              </Link>
            </div>
          ))}
          {docReqs.map((r) => {
            const items = parseItems(r.items);
            const missing = items.filter((i) => !i.fileId);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <FileUp className="h-4 w-4 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {missing.length} document{missing.length > 1 ? "s" : ""} à nous transmettre
                  </div>
                  <div className="truncate text-xs text-white/50">
                    {missing.map((i) => docLabel(i.docType, "fr")).join(", ")}
                  </div>
                </div>
                <Link
                  href={requestUrl(r.token)}
                  className="rounded-lg bg-electric px-3 py-1.5 text-xs font-medium text-white"
                >
                  Déposer
                </Link>
              </div>
            );
          })}
          {claims
            .filter((c) => c.status === "SENT" || c.status === "NEEDS_INFO")
            .map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <Undo2 className="h-4 w-4 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {c.status === "SENT"
                      ? "Formulaire de remboursement à remplir"
                      : "Complément demandé sur votre demande de remboursement"}
                  </div>
                </div>
                <Link
                  href={claimUrl(c.token)}
                  className="rounded-lg bg-electric px-3 py-1.5 text-xs font-medium text-white"
                >
                  {c.status === "SENT" ? "Remplir" : "Répondre"}
                </Link>
              </div>
            ))}
          {!todo ? (
            <p className="py-2 text-sm text-white/50">
              Nous vous préviendrons ici dès qu’une pièce ou un paiement sera attendu.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {checklists.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> Avancement de vos dossiers
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-white/5">
            {checklists.map(({ c, cl }) => {
              const pct = cl && cl.total ? Math.round((cl.done / cl.total) * 100) : null;
              const missing =
                cl?.items.filter((i) => i.required && (i.status === "missing" || i.status === "expired")) ??
                [];
              return (
                <div key={c.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">
                      {c.caseNumber} — {c.title}
                    </div>
                    <span className="text-xs text-white/50">{c.status.replace(/_/g, " ").toLowerCase()}</span>
                  </div>
                  {pct !== null ? (
                    <>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full ${pct === 100 ? "bg-emerald-400" : "bg-electric"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {cl!.done}/{cl!.total} pièces requises reçues
                        {missing.length
                          ? ` · manquantes : ${missing.map((m) => DOC_TYPE_LABELS[m.docType]).join(", ")}`
                          : ""}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {claims.filter((c) => ["SUBMITTED", "UNDER_REVIEW", "CONVERTED"].includes(c.status)).length ? (
        <Card>
          <CardHeader>
            <CardTitle>Suivi de vos demandes de remboursement</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-white/5">
            {claims
              .filter((c) => ["SUBMITTED", "UNDER_REVIEW", "CONVERTED"].includes(c.status))
              .map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {c.currency} {c.amount ? Number(c.amount).toFixed(2) : ""} ·{" "}
                      {c.status === "CONVERTED"
                        ? "acceptée"
                        : c.status === "UNDER_REVIEW"
                          ? "en cours d’examen"
                          : "reçue"}
                    </div>
                    <div className="text-xs text-white/50">
                      {c.submittedAt ? `Envoyée le ${c.submittedAt.toLocaleDateString("fr-FR")}` : ""}
                    </div>
                  </div>
                  <Link
                    href={claimUrl(c.token)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs"
                  >
                    Voir le suivi
                  </Link>
                </div>
              ))}
          </CardContent>
        </Card>
      ) : null}

      <form
        action={startClientRefund}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 p-4 text-sm"
      >
        <div>
          <div className="font-medium">Besoin d’un remboursement ?</div>
          <div className="text-xs text-white/50">
            Ouvrez le formulaire sécurisé : paiement concerné, motif, justificatifs, mode de remboursement.
          </div>
        </div>
        <button className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5">
          Faire une demande
        </button>
      </form>
    </div>
  );
}
