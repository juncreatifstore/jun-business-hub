import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createSignatureCenterRequest } from "@/services/signature-center";
import { FileSignature, Users, Send, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

const roles = [
  ["CLIENT", "Client"],
  ["AGENCY", "Agency / JUN"],
  ["WITNESS", "Witness"],
  ["GUARANTOR", "Guarantor"],
  ["PARTNER", "Partner"],
  ["OTHER", "Other"],
] as const;

export default async function NewSignatureRequestPage() {
  const user = await requireUser();
  if (!can(user, "DOCUMENT_SIGN")) redirect("/app/forbidden");

  const documents = await prisma.document.findMany({
    where: { status: "FINAL" },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { client: true, case: true },
  });

  const docusignReady = Boolean(
    (process.env.SIGNATURE_PROVIDER ?? "").toUpperCase() === "DOCUSIGN" &&
    process.env.DOCUSIGN_CLIENT_ID &&
    process.env.DOCUSIGN_USER_ID &&
    process.env.DOCUSIGN_ACCOUNT_ID &&
    process.env.DOCUSIGN_BASE_PATH &&
    process.env.DOCUSIGN_PRIVATE_KEY
  );

  return (
    <div>
      <PageHeader
        title="New signature request"
        subtitle={docusignReady ? "Prepare the document, place signer fields and send securely via DocuSign." : "Prepare the complete signature request now. It will remain READY FOR SIGNATURE until DocuSign is configured."}
        actions={<Link href="/app/signatures"><Button variant="secondary">Back to Signatures</Button></Link>}
      />

      {!docusignReady ? (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <span className="font-medium text-amber-300">DocuSign is not configured.</span>
          <span className="text-muted2"> You can still prepare the request, signers, routing order, message and PDF field positions. Nothing will be sent yet.</span>
        </div>
      ) : null}

      <form action={createSignatureCenterRequest} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-electric/10 text-electric"><FileSignature className="h-4 w-4" /></div>
              <div><p className="text-xs font-medium uppercase tracking-wider text-electric">Step 1</p><CardTitle>Document</CardTitle></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {documents.length ? (
              <Field label="Finalized document">
                <Select name="documentId" required defaultValue="">
                  <option value="" disabled>Choose a document…</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.documentId} — {d.title}{d.client ? ` — ${d.client.firstName} ${d.client.lastName}` : ""}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">No finalized documents are available. Finalize a document first, then return here.</div>
            )}
            <p className="text-xs text-muted2">Only FINAL documents can enter the signature workflow. A document can only have one active prepared/sent request at a time.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-electric/10 text-electric"><Users className="h-4 w-4" /></div>
              <div><p className="text-xs font-medium uppercase tracking-wider text-electric">Step 2</p><CardTitle>Signers & routing order</CardTitle></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {[1, 2, 3, 4].map((i) => {
              const agency = i === 2;
              return (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center justify-between"><p className="font-medium">Signer {i}</p><span className="text-xs text-muted2">Routing order {i}</span></div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Name"><Input name={`signer${i}Name`} defaultValue={agency ? `${user.firstName} ${user.lastName}` : ""} placeholder={i === 1 ? "Client full name" : "Optional signer"} /></Field>
                    <Field label="Email"><Input name={`signer${i}Email`} type="email" defaultValue={agency ? user.email : ""} placeholder="name@example.com" /></Field>
                    <Field label="Role"><Select name={`signer${i}Role`} defaultValue={agency ? "AGENCY" : i === 1 ? "CLIENT" : "OTHER"}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                  </div>

                  <div className="mt-5 rounded-lg border border-electric/20 bg-electric/[0.03] p-4">
                    <div className="mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-electric" /><p className="text-sm font-medium">PDF field placement</p></div>
                    <p className="mb-4 text-xs text-muted2">Coordinates use DocuSign PDF points. Page 1 starts at the top-left. Signature is required; the other fields are optional.</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Signature page"><Input name={`signer${i}SignaturePage`} type="number" min="1" defaultValue="1" /></Field>
                      <Field label="Signature X"><Input name={`signer${i}SignatureX`} type="number" min="0" defaultValue="72" /></Field>
                      <Field label="Signature Y"><Input name={`signer${i}SignatureY`} type="number" min="0" defaultValue={String(700 - (i - 1) * 90)} /></Field>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <div className="rounded-lg border border-white/10 p-3">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`signer${i}AddName`} defaultChecked /> Add signer name</label>
                        <div className="mt-3 grid grid-cols-3 gap-2"><Input name={`signer${i}NamePage`} type="number" min="1" defaultValue="1" /><Input name={`signer${i}NameX`} type="number" min="0" defaultValue="72" /><Input name={`signer${i}NameY`} type="number" min="0" defaultValue={String(660 - (i - 1) * 90)} /></div>
                      </div>
                      <div className="rounded-lg border border-white/10 p-3">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`signer${i}AddDate`} defaultChecked /> Add date signed</label>
                        <div className="mt-3 grid grid-cols-3 gap-2"><Input name={`signer${i}DatePage`} type="number" min="1" defaultValue="1" /><Input name={`signer${i}DateX`} type="number" min="0" defaultValue="330" /><Input name={`signer${i}DateY`} type="number" min="0" defaultValue={String(700 - (i - 1) * 90)} /></div>
                      </div>
                      <div className="rounded-lg border border-white/10 p-3">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`signer${i}AddInitials`} /> Add initials</label>
                        <div className="mt-3 grid grid-cols-3 gap-2"><Input name={`signer${i}InitialsPage`} type="number" min="1" defaultValue="1" /><Input name={`signer${i}InitialsX`} type="number" min="0" defaultValue="470" /><Input name={`signer${i}InitialsY`} type="number" min="0" defaultValue={String(700 - (i - 1) * 90)} /></div>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted2">Each optional row is Page / X / Y.</p>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted2">Signer 1 signs first, then signer 2, and so on. Leave unused signer rows empty. The same email cannot be used twice.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-electric/10 text-electric"><Send className="h-4 w-4" /></div>
              <div><p className="text-xs font-medium uppercase tracking-wider text-electric">Step 3</p><CardTitle>{docusignReady ? "Message & send" : "Message & prepare"}</CardTitle></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Accompanying message (optional)"><Textarea name="message" rows={5} maxLength={1000} defaultValue="Please review the attached document and complete your signature at your earliest convenience. If you have any questions, contact JUN CREATIF AND TRAVEL LLC before signing." /></Field>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-muted2">
              {docusignReady
                ? "Sending creates a tracked DocuSign envelope. JUN records signer order, field placements, timestamps and audit events."
                : "Preparing stores the full request in JUN with status READY FOR SIGNATURE. It will not contact any signer until DocuSign is configured and you explicitly send it."}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="gold" disabled={!documents.length}>{docusignReady ? "Send signature request" : "Prepare signature request"}</Button>
              <Link href="/app/signatures"><Button type="button" variant="ghost">Cancel</Button></Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
