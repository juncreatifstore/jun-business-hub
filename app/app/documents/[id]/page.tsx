import Link from "next/link";
import { GitCompareArrows, RotateCcw, ShieldCheck, PanelsTopLeft, Scissors, Printer, Copy, Archive, MessageCircle, Eye, FileCheck2, Hash, RefreshCw } from "lucide-react";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DocumentEditor } from "@/components/app/document-editor";
import { DocumentRefreshControl } from "@/components/app/document-refresh-control";
import { DocumentWorkspaceHeader } from "@/components/app/document-workspace-header";
import { createDocumentRevision, duplicateDocument, archiveDocument, saveDocumentVersion } from "@/services/documents";
import { restoreDocumentVersion } from "@/services/document-versions";
import { createSignatureRequest } from "@/services/signatures";
import { sendClientSignatureViaWhatsApp } from "@/services/signature-whatsapp";
import { formatDateTime } from "@/lib/utils";
import { shortHash } from "@/lib/hash";

export const dynamic = "force-dynamic";

function recipientCount(recipients: unknown): number {
  if (Array.isArray(recipients)) return recipients.length;
  if (recipients && typeof recipients === "object") {
    const value = recipients as { signers?: unknown[]; recipients?: unknown[] };
    if (Array.isArray(value.signers)) return value.signers.length;
    if (Array.isArray(value.recipients)) return value.recipients.length;
  }
  return 0;
}

export default async function DocumentDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("DOCUMENT_READ");
  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: {
      client: true, case: true, author: true,
      versions: { orderBy: { version: "desc" }, include: { author: true } },
      signatures: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!doc) notFound();
  const latest = doc.versions[0];
  const canEditDraft = can(user, "DOCUMENT_EDIT") && doc.status === "DRAFT";
  const canCreateRevision = can(user, "DOCUMENT_EDIT") && doc.status === "FINAL";
  const canRefreshFromData = can(user, "DOCUMENT_EDIT") && Boolean(doc.client) && ["DRAFT", "FINAL"].includes(doc.status);
  const canRequestSignature = doc.status === "FINAL" && can(user, "DOCUMENT_SIGN");
  const sealed = ["FINAL", "SIGNED"].includes(doc.status);

  return (
    <div>
      <DocumentWorkspaceHeader
        documentId={doc.documentId}
        title={doc.title}
        type={doc.type}
        status={doc.status}
        version={latest?.version ?? 1}
        client={doc.client ? { id: doc.client.id, name: `${doc.client.firstName} ${doc.client.lastName}` } : null}
        caseInfo={doc.case ? { id: doc.case.id, number: doc.case.caseNumber } : null}
        contentHash={doc.finalHash ? shortHash(doc.finalHash) : null}
        pdfHash={doc.finalPdfHash ? shortHash(doc.finalPdfHash) : null}
        finalizedAt={doc.finalizedAt ? formatDateTime(doc.finalizedAt) : null}
        actions={<>
          <a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer"><Button variant="outline"><Eye className="h-4 w-4" />PDF</Button></a>
          {canRefreshFromData ? <DocumentRefreshControl documentId={doc.id} variant="outline" showResult={true} /> : null}
          {canEditDraft ? <Link href={`/app/documents/${doc.id}/finalize`}><Button variant="gold"><FileCheck2 className="h-4 w-4" />Finaliser</Button></Link> : null}
          {canRequestSignature ? <form action={sendClientSignatureViaWhatsApp.bind(null, doc.id)}><Button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-500"><MessageCircle className="h-4 w-4" />Signature WhatsApp</Button></form> : null}
        </>}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0 space-y-4">
          {sealed ? <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.045] p-4 text-sm text-emerald-200">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Document officiel scellé</p>
            <p className="mt-1 text-xs leading-5 text-emerald-200/70">Le PDF officiel et ses empreintes d’intégrité sont conservés. Toute modification nécessite une nouvelle révision afin de préserver l’historique vérifiable.</p>
          </div> : null}

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-white/[0.06]"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{canEditDraft ? "Éditeur du document" : "Aperçu du document"}</CardTitle><p className="mt-1 text-xs text-muted2">Version {latest?.version ?? 1} · {canEditDraft ? "modifiable" : "lecture seule"}</p></div><Link href={`/app/documents/${doc.id}/fill`}><Button size="sm" variant="outline">Preview / Fill</Button></Link></div></CardHeader>
            <CardContent className="p-3 sm:p-5">
              {canEditDraft ? (
                <DocumentEditor documentId={doc.id} initialContent={latest?.content ?? "<p></p>"} action={saveDocumentVersion.bind(null, doc.id)} readOnly={false} />
              ) : (
                <div className="doc-prose min-h-[640px] rounded-xl border border-slate-200 bg-white px-6 py-7 text-[15px] text-night shadow-[0_18px_45px_rgba(0,0,0,.15)] sm:px-9" dangerouslySetInnerHTML={{ __html: latest?.content ?? "<p></p>" }} />
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[92px] xl:self-start">
          {canRefreshFromData ? <Card className="border-blue-400/15 bg-blue-500/[0.035]"><CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-blue-400" />Données client</CardTitle></CardHeader><CardContent><p className="mb-3 text-xs leading-5 text-muted2">Après l’enregistrement tardif d’un paiement, remboursement ou autre correction, recréez une version depuis les données autoritaires les plus récentes.</p><DocumentRefreshControl documentId={doc.id} variant="gold" fullWidth={true} showResult={true} /></CardContent></Card> : null}

          {canCreateRevision ? <Card><CardHeader><CardTitle>Créer une révision</CardTitle></CardHeader><CardContent><p className="text-xs leading-5 text-muted2">Le PDF FINAL actuel reste intact. Une nouvelle version DRAFT est créée pour les modifications.</p><form action={createDocumentRevision.bind(null, doc.id)} className="mt-3 space-y-2"><Input name="reason" required maxLength={300} placeholder="Motif de la révision" /><Button type="submit" variant="outline" className="w-full">Créer la révision</Button></form></CardContent></Card> : null}

          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <Link href={`/app/documents/${doc.id}/fill`}><Button className="w-full justify-start" variant="outline"><Eye className="mr-2 h-4 w-4" />Preview / Fill</Button></Link>
              {canRequestSignature ? <form action={sendClientSignatureViaWhatsApp.bind(null, doc.id)}><Button className="w-full justify-start bg-emerald-600 text-white hover:bg-emerald-500" type="submit"><MessageCircle className="mr-2 h-4 w-4" />Signature client via WhatsApp</Button></form> : null}
              {canRequestSignature ? <form action={createSignatureRequest.bind(null, doc.id)}><Button className="w-full justify-start" variant="primary" type="submit">Autre méthode de signature</Button></form> : null}
              <Link href={`/app/documents/${doc.id}/pages`}><Button className="w-full justify-start" variant="outline"><PanelsTopLeft className="mr-2 h-4 w-4" />Gérer les pages</Button></Link>
              {can(user, "DOCUMENT_CREATE") ? <Link href={`/app/documents/${doc.id}/split`}><Button className="w-full justify-start" variant="outline"><Scissors className="mr-2 h-4 w-4" />Diviser le document</Button></Link> : null}
              <Link href={`/app/documents/${doc.id}/versions`}><Button className="w-full justify-start" variant="outline"><GitCompareArrows className="mr-2 h-4 w-4" />Versions & comparaison</Button></Link>
              <Link href={`/app/documents/${doc.id}/print`} target="_blank"><Button className="w-full justify-start" variant="outline"><Printer className="mr-2 h-4 w-4" />Imprimer</Button></Link>
              {can(user, "DOCUMENT_CREATE") ? <form action={duplicateDocument.bind(null, doc.id)}><Button className="w-full justify-start" variant="ghost"><Copy className="mr-2 h-4 w-4" />Dupliquer</Button></form> : null}
              {can(user, "DOCUMENT_DELETE") && doc.status !== "ARCHIVED" ? <form action={archiveDocument.bind(null, doc.id)}><Button className="w-full justify-start text-red-400" variant="ghost"><Archive className="mr-2 h-4 w-4" />Archiver</Button></form> : null}
            </CardContent>
          </Card>

          <Card className={sealed ? "border-emerald-400/15" : undefined}>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" />Intégrité & vérification</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><div className="text-muted2">Vérification publique</div><div className="mt-1 font-medium text-slate-300">/verify/{doc.documentId}</div></div>
              <div className="flex items-start gap-2 text-muted2"><Hash className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span>{doc.finalHash ? `Contenu SHA-256 ${shortHash(doc.finalHash)}` : "Empreinte de contenu créée lors de la finalisation"}</span></div>
              <div className="flex items-start gap-2 text-muted2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span>{doc.finalPdfHash ? `PDF SHA-256 ${shortHash(doc.finalPdfHash)}` : "Empreinte PDF créée lors de la finalisation"}</span></div>
              <p className="leading-5 text-muted2">Le QR code, l’identifiant du document et l’empreinte en ligne servent à authentifier le document JUN sans exiger la signature manuscrite du responsable de l’entreprise.</p>
            </CardContent>
          </Card>

          <Card><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>Versions</CardTitle><Link href={`/app/documents/${doc.id}/versions`} className="text-xs font-medium text-electric hover:underline">Comparer</Link></div></CardHeader><CardContent className="p-0"><ul className="max-h-[360px] divide-y divide-line overflow-y-auto">{doc.versions.map((v, index) => <li key={v.id} className="px-4 py-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Version {v.version}{index === 0 ? " · actuelle" : ""}</p><StatusBadge status={v.status} /></div><p className="mt-1 text-xs text-muted2">{v.author.firstName} {v.author.lastName} · {formatDateTime(v.createdAt)}</p>{v.changeNote ? <p className="mt-1 text-xs leading-5 text-muted2">{v.changeNote}</p> : null}<p className="registry-id mt-1 text-[10px] text-muted2">{shortHash(v.hash)}</p>{canEditDraft && index > 0 ? <form action={restoreDocumentVersion.bind(null, doc.id, v.id)} className="mt-2"><Button type="submit" variant="ghost" className="h-8 px-2 text-xs"><RotateCcw className="mr-1 h-3.5 w-3.5" />Restaurer comme nouvelle version</Button></form> : null}</li>)}</ul></CardContent></Card>

          {doc.signatures.length > 0 ? <Card><CardHeader><CardTitle>Signatures</CardTitle></CardHeader><CardContent className="p-0"><ul className="divide-y divide-line">{doc.signatures.map((s) => <li key={s.id} className="px-4 py-3"><div className="flex items-center justify-between gap-2"><Link href={`/app/signatures/${s.id}`} className="text-sm font-medium hover:text-electric">{s.provider} request</Link><StatusBadge status={s.status} /></div><p className="mt-1 text-xs text-muted2">{recipientCount(s.recipients)} signataire(s) · {formatDateTime(s.createdAt)}</p></li>)}</ul></CardContent></Card> : null}
        </aside>
      </div>
    </div>
  );
}
