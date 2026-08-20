"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function voidTrackedSignatureRequest(requestId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: { document: true },
  });
  if (!request) redirect("/app/signatures?toast_error=Request not found");
  if (request.status === "SIGNED") redirect(`/app/signatures/${request.id}?toast_error=A completed request cannot be voided`);
  if (request.status === "VOIDED") redirect(`/app/signatures/${request.id}?toast=Request already voided`);

  if (request.provider === "DOCUSIGN" && request.providerEnvelopeId) {
    try {
      const { docusignVoid } = await import("@/lib/docusign");
      await docusignVoid(request.providerEnvelopeId, `Voided from JUN Business Hub by ${user.firstName} ${user.lastName}`);
    } catch (e) {
      redirect(`/app/signatures/${request.id}?toast_error=${encodeURIComponent(e instanceof Error ? e.message : "Could not void DocuSign envelope")}`);
    }
  }

  await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "VOIDED" } });
  await audit({
    userId: user.id,
    action: "SIGNATURE_REQUEST_VOID",
    resourceType: "SignatureRequest",
    resourceId: request.id,
    after: { documentId: request.document.documentId, provider: request.provider, providerEnvelopeId: request.providerEnvelopeId },
  });
  revalidatePath("/app/signatures");
  revalidatePath(`/app/signatures/${request.id}`);
  redirect(`/app/signatures/${request.id}?toast=Request voided`);
}
