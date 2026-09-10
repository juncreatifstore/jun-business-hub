import { prisma } from "@/lib/prisma";
import { FinancialAuthorizationDecision } from "@/components/app/financial-authorization-decision";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getFinancialAuthorizationPolicy, listFinancialAuthorizations } from "@/lib/company-funds-approvals";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, CheckCircle2, XCircle, Clock3, AlertTriangle } from "lucide-react";
import { updateFinancialAuthorizationPolicyAction } from "@/services/company-funds-approvals";

export const dynamic = "force-dynamic";
export default async function FinancialAuthorizationsPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/app/forbidden");
  const [items, policy, activeAdmins] = await Promise.all([
    listFinancialAuthorizations(),
    getFinancialAuthorizationPolicy(),
    prisma.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } }),
  ]);
  const pending = items.filter((a) => a.status === "PENDING"),
    approved = items.filter((a) => a.status === "APPROVED"),
    rejected = items.filter((a) => a.status === "REJECTED");
  return (
    <div className="space-y-5">
      <PageHeader
        title="Autorisations financières"
        subtitle="Contrôle des grosses sorties, double approbation, séparation demandeur/approbateur et protection des réserves avant exécution."
      />
      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={Clock3} label="En attente" value={String(pending.length)} hint="Décisions requises" />
        <Metric
          icon={CheckCircle2}
          label="Approuvées"
          value={String(approved.length)}
          hint="Autorisées à exécuter"
        />
        <Metric icon={XCircle} label="Rejetées" value={String(rejected.length)} hint="Bloquées" />
        <Metric
          icon={AlertTriangle}
          label="Impact réserves"
          value={String(items.filter((a) => a.reserveImpact && a.status === "PENDING").length)}
          hint="Sorties utilisant du cash protégé"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Politique d&apos;autorisation</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateFinancialAuthorizationPolicyAction} className="grid gap-3 md:grid-cols-4">
            <label className="text-xs font-medium text-ink">
              Seuil approbation simple
              <input
                name="singleApprovalThreshold"
                type="number"
                step="0.01"
                defaultValue={policy.singleApprovalThreshold}
                className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface-1 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
            <label className="text-xs font-medium text-ink">
              Seuil double approbation
              <input
                name="dualApprovalThreshold"
                type="number"
                step="0.01"
                defaultValue={policy.dualApprovalThreshold}
                className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface-1 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
            <label className="flex h-9 items-center gap-2 self-end rounded-lg border border-line bg-surface-1 px-3 text-xs text-ink">
              <input
                name="reserveOverrideAlwaysDual"
                type="checkbox"
                defaultChecked={policy.reserveOverrideAlwaysDual}
              />
              Double approbation si réserve protégée touchée
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-line bg-surface-2/60 p-3 text-xs text-ink md:col-span-4">
              <input
                name="singleAdminMode"
                type="checkbox"
                defaultChecked={policy.singleAdminMode === true}
                className="mt-1"
              />
              <span>
                Activer le mode Administrateur unique
                <span className="mt-1 block text-muted2">
                  Autorise une validation personnelle avec motif et confirmation uniquement lorsqu’un seul
                  Super Admin est actif et qu’une seule approbation est requise. Devient inopérant dès qu’un
                  deuxième Super Admin est actif.
                </span>
                <span className="mt-1 block">
                  Super Admins actifs : {activeAdmins} ·{" "}
                  {policy.singleAdminMode && activeAdmins === 1 ? "Mode disponible" : "Mode inactif"}
                </span>
              </span>
            </label>
            <button className="h-9 self-end rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg shadow-card hover:bg-accent/90">
              Enregistrer la politique
            </button>
          </form>
          <p className="mt-3 text-[11px] text-muted2">
            Les montants sont évalués dans la devise native de l&apos;opération, sans conversion implicite
            entre devises.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Demandes et décisions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium text-ink-2">
                  <th className="p-2">Référence</th>
                  <th className="p-2">Type</th>
                  <th className="p-2 text-right">Montant</th>
                  <th className="p-2">Motif</th>
                  <th className="p-2">Approbations</th>
                  <th className="p-2">Statut</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const yes = a.decisions.filter((d) => d.decision === "APPROVE").length;
                  return (
                    <tr key={a.id} className="border-b border-line/70 align-top">
                      <td className="p-2 font-medium">
                        {a.reference}
                        <div className="text-[10px] text-muted2">{formatDateTime(a.createdAt)}</div>
                      </td>
                      <td className="p-2">
                        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-2">
                          {a.type}
                        </span>
                        {a.reserveImpact ? (
                          <div className="mt-1 text-2xs font-semibold text-danger">Impact réserve</div>
                        ) : null}
                      </td>
                      <td className="p-2 text-right font-semibold">{formatMoney(a.amount, a.currency)}</td>
                      <td className="p-2 text-xs">
                        <div>{a.description}</div>
                        <div className="mt-1 text-muted2">{a.reason}</div>
                      </td>
                      <td className="p-2">
                        <div className="font-semibold">
                          {yes}/{a.requiredApprovals}
                        </div>
                        <div className="mt-1 text-[10px] text-muted2">
                          {a.decisions
                            .map(
                              (d) =>
                                `${d.decision}${d.singleAdminException ? " (exception Administrateur unique)" : ""} · ${formatDateTime(d.decidedAt)}`,
                            )
                            .join(" · ") || "Aucune décision"}
                        </div>
                      </td>
                      <td className="p-2">
                        <Badge
                          tone={
                            a.status === "APPROVED"
                              ? "success"
                              : a.status === "REJECTED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {a.status === "APPROVED"
                            ? "Approuvée"
                            : a.status === "REJECTED"
                              ? "Rejetée"
                              : "En attente"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {a.status === "PENDING" ? (
                          <FinancialAuthorizationDecision
                            id={a.id}
                            requester={a.requestedById === user.id}
                            singleAdminAllowed={
                              policy.singleAdminMode === true &&
                              activeAdmins === 1 &&
                              a.requiredApprovals === 1
                            }
                            alreadyDecided={a.decisions.some((d) => d.userId === user.id)}
                          />
                        ) : (
                          <span className="text-xs text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!items.length ? (
            <p className="py-5 text-center text-sm text-muted2">Aucune demande d&apos;autorisation.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <Icon className="mb-2 h-5 w-5 text-electric" />
      <div className="text-xs text-muted2">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted2">{hint}</div>
    </div>
  );
}
