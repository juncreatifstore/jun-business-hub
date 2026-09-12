import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, Clock3, FileText, Upload } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { uploadFile } from "@/services/files";
import { FILE_CATEGORIES } from "@/lib/utils";
import { clientDocumentGroups } from "@/lib/client-documents";
import { DOC_TYPE_LABELS } from "@/lib/file-extraction";
import { DocumentRequestsPanel } from "@/components/app/document-requests-panel";

export const dynamic = "force-dynamic";

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const d = (v: Date | null) => (v ? v.toLocaleDateString("fr-FR") : "—");

export default async function DriveClientPage(props: { params: Promise<{ clientId: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  if (!can(user, "FILE_READ") || !can(user, "CLIENT_READ")) redirect("/app/forbidden");
  const client = await prisma.client.findFirst({
    where: { id: params.clientId, archivedAt: null },
    select: {
      id: true,
      internalId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      whatsapp: true,
      nationality: true,
      cases: { select: { id: true, caseNumber: true, title: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) notFound();
  const { groups, missing, required, alerts, total, pending } = await clientDocumentGroups(client.id);
  const canUpload = can(user, "FILE_UPLOAD");

  return (
    <div className="space-y-5 text-ink">
      <Link
        prefetch={false}
        href="/app/drive/clients"
        className="inline-flex items-center gap-1 text-xs text-muted2 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>
      <PageHeader
        eyebrow="Client documents"
        title={`${client.firstName} ${client.lastName}`}
        subtitle={[client.internalId, client.nationality, client.email, client.phone]
          .filter(Boolean)
          .join(" · ")}
        actionHref={`/app/clients/${client.id}`}
        actionLabel="Open client record"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-wide text-muted2">Documents</div>
            <div className="mt-1 text-2xl font-semibold">{total}</div>
            {pending ? <div className="text-xs text-muted2">{pending} awaiting analysis</div> : null}
          </CardContent>
        </Card>
        <Card className={missing.length ? "border-amber-200" : ""}>
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-wide text-muted2">
              Missing <span className="normal-case">({required.length} required by open cases)</span>
            </div>
            {missing.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {missing.map((t) => (
                  <li key={t} className="flex items-center gap-2 text-amber-800">
                    <FileText className="h-3.5 w-3.5" /> {DOC_TYPE_LABELS[t]}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-sm text-emerald-700">Complete</div>
            )}
          </CardContent>
        </Card>
        <Card
          className={
            alerts.some((a) => a.status === "expired")
              ? "border-red-200"
              : alerts.length
                ? "border-amber-200"
                : ""
          }
        >
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-wide text-muted2">Expirations</div>
            {alerts.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {alerts.map((a) => (
                  <li
                    key={a.fileId}
                    className={`flex items-center gap-2 ${a.status === "expired" ? "text-red-700" : "text-amber-800"}`}
                  >
                    {a.status === "expired" ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <Clock3 className="h-3.5 w-3.5" />
                    )}
                    {DOC_TYPE_LABELS[a.docType]} · {a.status === "expired" ? "expired " : ""}
                    {d(a.expiresAt)}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-sm text-muted2">Nothing expiring within 90 days</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted2">
              No document yet for this client. Upload one on the right — it will be typed automatically.
            </div>
          ) : (
            groups.map((g) => (
              <Card key={g.docType}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {g.label} <span className="ml-1 text-xs font-normal text-muted2">({g.files.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-line">
                    {g.files.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                        <Link
                          prefetch={false}
                          href={`/app/drive?q=${encodeURIComponent(f.name)}`}
                          className="min-w-0 flex-1 truncate font-medium hover:text-electric"
                          title={f.name}
                        >
                          {f.name}
                        </Link>
                        {f.documentNumber ? (
                          <span className="font-mono text-xs text-muted2">{f.documentNumber}</span>
                        ) : null}
                        {f.expiresAt ? (
                          <span
                            className={`text-xs ${
                              f.expiry === "expired"
                                ? "font-medium text-red-700"
                                : f.expiry === "critical" || f.expiry === "soon"
                                  ? "text-amber-700"
                                  : "text-muted2"
                            }`}
                          >
                            {f.expiry === "expired" ? "expired " : "exp. "}
                            {d(f.expiresAt)}
                          </span>
                        ) : null}
                        <span className="text-xs text-muted2">
                          {size(f.sizeBytes)} · {d(f.createdAt)}
                        </span>
                        <a
                          href={`/api/files/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface"
                        >
                          Open
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        <div className="space-y-4">
          {canUpload ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Request documents from the client</CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentRequestsPanel
                  clientId={client.id}
                  returnTo={`/app/drive/clients/${client.id}`}
                  missing={missing}
                  hasEmail={Boolean(client.email)}
                  hasWhatsApp={Boolean(client.whatsapp || client.phone)}
                  compact
                />
              </CardContent>
            </Card>
          ) : null}
          {canUpload ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4" /> Add a document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FileUploadForm
                  action={uploadFile}
                  categories={[...FILE_CATEGORIES]}
                  clients={[
                    { id: client.id, label: `${client.firstName} ${client.lastName} (${client.internalId})` },
                  ]}
                  cases={client.cases.map((c) => ({ id: c.id, label: `${c.caseNumber} — ${c.title}` }))}
                  defaultClientId={client.id}
                  returnTo={`/app/drive/clients/${client.id}`}
                />
              </CardContent>
            </Card>
          ) : null}
          {client.cases.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cases</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {client.cases.map((c) => (
                    <li key={c.id}>
                      <Link prefetch={false} href={`/app/cases/${c.id}`} className="hover:text-electric">
                        {c.caseNumber} — {c.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
