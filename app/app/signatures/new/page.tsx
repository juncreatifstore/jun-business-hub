import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createSignatureCenterRequest } from "@/services/signature-center";
import { FileSignature, Users, Send } from "lucide-react";

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

  return (
    <div>
      <PageHeader
        title="New signature request"
        subtitle="Choose a finalized document, define the signers and send the request securely."
        actions={<Link href="/app/signatures"><Button variant="secondary">Back to Signatures</Button></Link>}
      />

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
                    <option key={d.id} value={d.id}>
                      {d.documentId} — {d.title}{d.client ? ` — ${d.client.firstName} ${d.client.lastName}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                No finalized documents are available. Finalize a document first, then return here.
              </div>
            )}
            <p className="text-xs text-muted2">Only documents with status FINAL can be sent for signature. An active request for the same document cannot be duplicated.</p>
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
              <div><p className="text-xs font-medium uppercase tracking-wider text-electric">Step 3</p><CardTitle>Message & send</CardTitle></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Accompanying message (optional)">
              <Textarea name="message" rows={5} maxLength={1000} defaultValue="Please review the attached document and complete your signature at your earliest convenience. If you have any questions, contact JUN CREATIF AND TRAVEL LLC before signing." />
            </Field>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-muted2">
              Sending creates a tracked signature request. JUN records the provider envelope ID, signer order, timestamps and audit events. Completed DocuSign envelopes are archived with a SHA-256 integrity hash.
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="gold" disabled={!documents.length}>Send signature request</Button>
              <Link href="/app/signatures"><Button type="button" variant="ghost">Cancel</Button></Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
