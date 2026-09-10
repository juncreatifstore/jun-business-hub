import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientBlock } from "@/lib/client-transaction-block";
import { uploadFile } from "@/services/files";
import { ClientWorkspaceHeader } from "@/components/app/client-workspace-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { formatDate, formatDateTime } from "@/lib/utils";
import { FileText, FolderOpen, UploadCloud, ShieldCheck, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const FILE_CATEGORIES = [
  "IDENTITY",
  "PASSPORT",
  "CONTRACT",
  "PAYMENT_PROOF",
  "RECEIPT",
  "REFUND",
  "VISA",
  "FLIGHT",
  "INVOICE",
  "LEGAL",
  "OTHER",
];
const CORE_CATEGORIES = ["IDENTITY", "PASSPORT"];

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const user = await requirePermission("CLIENT_READ");
  const { id } = await Promise.resolve(params);
  const [client, block] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        tags: true,
        cases: {
          orderBy: { createdAt: "desc" },
          select: { id: true, caseNumber: true, title: true, status: true },
        },
        documents: {
          orderBy: { updatedAt: "desc" },
          include: { case: { select: { id: true, caseNumber: true, title: true } } },
        },
        files: {
          where: { isVault: false, archivedAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            case: { select: { id: true, caseNumber: true, title: true } },
            uploadedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    getClientBlock(id),
  ]);
  if (!client) notFound();

  const blocked = Boolean(block?.blocked);
  const archived = client.status === "ARCHIVED";
  const filesByCategory = new Map<string, number>();
  for (const f of client.files) filesByCategory.set(f.category, (filesByCategory.get(f.category) || 0) + 1);
  const missingCore = CORE_CATEGORIES.filter((c) => !filesByCategory.get(c));
  const signedDocs = client.documents.filter((d) => d.status === "SIGNED").length;
  const finalDocs = client.documents.filter((d) => ["FINAL", "SIGNED"].includes(d.status)).length;
  const linkedFiles = client.files.filter((f) => Boolean(f.caseId)).length;
  const unlinkedFiles = client.files.filter((f) => !f.caseId).length;
  const activeCases = client.cases.filter((c) => !["ARCHIVED", "CANCELLED"].includes(c.status));

  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        client={client}
        tags={client.tags}
        blocked={blocked}
        canUpdate={can(user, "CLIENT_UPDATE")}
        newServicesAllowed={!blocked && !archived}
        paymentsAllowed={!archived}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Documents</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Documents officiels & Drive</h2>
          <p className="mt-1 text-sm text-slate-500">
            Documents JUN, identité, preuves, pièces de voyage et fichiers liés aux dossiers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/drive?q=${encodeURIComponent(client.lastName)}`}>
            <Button variant="outline">Ouvrir Drive</Button>
          </Link>
          {can(user, "DOCUMENT_CREATE") ? (
            <Link href={`/app/documents/new?clientId=${client.id}`}>
              <Button variant="primary">Nouveau document</Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          icon={FileText}
          label="Documents officiels"
          value={String(client.documents.length)}
          hint={`${finalDocs} final / signé`}
          tone="blue"
        />
        <Metric
          icon={ShieldCheck}
          label="Signés"
          value={String(signedDocs)}
          hint="Documents avec statut signé"
          tone="green"
        />
        <Metric
          icon={FolderOpen}
          label="Fichiers Drive"
          value={String(client.files.length)}
          hint={`${linkedFiles} lié(s) à un dossier`}
          tone="violet"
        />
        <Metric
          icon={FolderOpen}
          label="Non rattachés"
          value={String(unlinkedFiles)}
          hint="À vérifier et rattacher"
          tone={unlinkedFiles ? "amber" : "green"}
        />
        <Metric
          icon={AlertTriangle}
          label="Pièces essentielles"
          value={String(missingCore.length)}
          hint={missingCore.length ? missingCore.join(" · ") : "Identité de base présente"}
          tone={missingCore.length ? "amber" : "green"}
        />
      </div>

      {missingCore.length ? (
        <Card className="border-amber-400/15 bg-amber-500/[0.055]">
          <CardHeader>
            <CardTitle>Attention dossier client</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-amber-100">
            Catégorie importante manquante : <strong>{missingCore.join(", ")}</strong>. Ajoutez le document
            disponible pour conserver un dossier complet et facilement vérifiable.
          </CardContent>
        </Card>
      ) : null}

      {can(user, "FILE_UPLOAD") ? (
        <Card className="bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Ajouter un fichier</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Le fichier sera automatiquement rattaché au client.
              </p>
            </div>
            <UploadCloud className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <form action={uploadFile} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <input type="hidden" name="isVault" value="0" />
              <input type="hidden" name="clientId" value={client.id} />
              <Field label="Fichier">
                <Input type="file" name="file" required />
              </Field>
              <Field label="Catégorie">
                <Select name="category" defaultValue="OTHER">
                  {FILE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prestation / dossier">
                <Select name="caseId" defaultValue="">
                  <option value="">— Dossier général client —</option>
                  {activeCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caseNumber} · {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end md:col-span-2 xl:col-span-2">
                <Button type="submit" variant="primary">
                  <UploadCloud className="h-4 w-4" />
                  Ajouter & rattacher
                </Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-slate-600">
              Utilisez un dossier lorsqu’un fichier appartient à une prestation précise. Les pièces d’identité
              générales peuvent rester au niveau du client.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-[#0e1624]">
        <CardHeader>
          <div>
            <CardTitle>Inventaire par catégorie</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Aperçu rapide des pièces présentes dans le dossier.</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {FILE_CATEGORIES.map((cat) => {
              const count = filesByCategory.get(cat) || 0;
              return (
                <Link key={cat} href={`/app/drive?category=${cat}&q=${encodeURIComponent(client.lastName)}`}>
                  <Badge
                    className={
                      count
                        ? "border border-emerald-500/15 bg-emerald-500/[0.07] text-emerald-600"
                        : "border border-white/[0.06] bg-white/[0.02] text-slate-600"
                    }
                  >
                    {cat.replaceAll("_", " ")} · {count}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden bg-[#0e1624]">
        <CardHeader>
          <div>
            <CardTitle>Documents officiels JUN</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Contrats, accords, factures, lettres et documents du registre.
            </p>
          </div>
          {can(user, "DOCUMENT_CREATE") ? (
            <Link
              href={`/app/documents/new?clientId=${client.id}`}
              className="text-sm font-medium text-blue-400 hover:text-blue-300"
            >
              Créer document
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {client.documents.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.025] text-left text-[10px] uppercase tracking-[0.12em] text-slate-600">
                  <tr>
                    <th className="p-3">Document</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Dossier</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3">Mise à jour</th>
                  </tr>
                </thead>
                <tbody>
                  {client.documents.map((d) => (
                    <tr key={d.id} className="border-t border-white/[0.055] transition hover:bg-white/[0.02]">
                      <td className="p-3">
                        <Link
                          href={`/app/documents/${d.id}`}
                          className="font-medium text-slate-200 hover:text-blue-400"
                        >
                          {d.title}
                        </Link>
                        <div className="registry-id mt-1 text-xs text-slate-600">{d.documentId}</div>
                      </td>
                      <td className="p-3">{d.type.replaceAll("_", " ")}</td>
                      <td className="p-3">
                        {d.case ? (
                          <Link href={`/app/cases/${d.case.id}`} className="text-blue-400 hover:underline">
                            {d.case.caseNumber}
                          </Link>
                        ) : (
                          <span className="text-slate-600">Niveau client</span>
                        )}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="p-3 text-slate-600">{formatDateTime(d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">Aucun document officiel lié à ce client.</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden bg-[#0e1624]">
        <CardHeader>
          <div>
            <CardTitle>Fichiers Drive</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Pièces téléversées, preuves et fichiers opérationnels.
            </p>
          </div>
          <Link href="/app/drive" className="text-sm font-medium text-blue-400 hover:text-blue-300">
            Drive complet
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {client.files.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.025] text-left text-[10px] uppercase tracking-[0.12em] text-slate-600">
                  <tr>
                    <th className="p-3">Fichier</th>
                    <th className="p-3">Catégorie</th>
                    <th className="p-3">Prestation / dossier</th>
                    <th className="p-3">Taille</th>
                    <th className="p-3">Ajouté</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {client.files.map((f) => (
                    <tr key={f.id} className="border-t border-white/[0.055] transition hover:bg-white/[0.02]">
                      <td className="p-3">
                        <div className="font-medium text-slate-200">{f.name}</div>
                        <div className="mt-1 text-xs text-slate-600">{f.mimeType}</div>
                      </td>
                      <td className="p-3">
                        <Badge className="border border-white/[0.06] bg-white/[0.02] text-slate-500">
                          {f.category.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {f.case ? (
                          <Link href={`/app/cases/${f.case.id}`} className="text-blue-400 hover:underline">
                            {f.case.caseNumber} · {f.case.title}
                          </Link>
                        ) : (
                          <span className="text-amber-400">Dossier général client</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">{bytes(f.sizeBytes)}</td>
                      <td className="p-3">
                        <div>{formatDate(f.createdAt)}</div>
                        <div className="text-xs text-slate-600">
                          {f.uploadedBy.firstName} {f.uploadedBy.lastName}
                        </div>
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/app/drive?q=${encodeURIComponent(f.name)}`}
                          className="text-blue-400 hover:underline"
                        >
                          Trouver dans Drive
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">Aucun fichier Drive lié à ce client.</p>
          )}
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
  tone,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "green" | "violet" | "amber";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-emerald-500/10 text-emerald-400",
    violet: "bg-violet-500/10 text-violet-400",
    amber: "bg-amber-500/10 text-amber-400",
  };
  return (
    <Card className="bg-[#0e1624]">
      <CardContent className="p-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="mt-3 text-xs text-slate-500">{label}</div>
        <div className="mt-1 text-xl font-semibold text-slate-100">{value}</div>
        <div className="mt-1 text-[11px] text-slate-600">{hint}</div>
      </CardContent>
    </Card>
  );
}
