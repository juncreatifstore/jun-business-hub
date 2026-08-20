"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  signatureRecipients,
  signatureRequestMeta,
  signatureRecipientsPayload,
  defaultSignatureFieldSize,
  type SignatureField,
} from "@/lib/signature-recipients";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const FIELD_TYPES = new Set<SignatureField["type"]>(["SIGNATURE", "INITIALS", "DATE_SIGNED", "NAME"]);

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export async function saveSignaturePlacements(requestId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId } });
  if (!request) redirect("/app/signatures?toast_error=Request not found");
  if (request.status !== "READY_FOR_SIGNATURE") redirect(`/app/signatures/${request.id}?toast_error=Field placement can only be edited before sending`);

  const raw = String(formData.get("placements") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    redirect(`/app/signatures/${request.id}/prepare?toast_error=Invalid field placement data`);
  }

  if (!Array.isArray(parsed)) redirect(`/app/signatures/${request.id}/prepare?toast_error=Invalid field placement data`);

  const recipients = signatureRecipients(request.recipients);
  const meta = signatureRequestMeta(request.recipients);
  const byEmail = new Map(recipients.map((r) => [r.email.toLowerCase(), r]));
  recipients.forEach((r) => { r.fields = []; });

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const email = typeof v.email === "string" ? v.email.toLowerCase() : "";
    const type = typeof v.type === "string" ? v.type as SignatureField["type"] : "SIGNATURE";
    const recipient = byEmail.get(email);
    if (!recipient || !FIELD_TYPES.has(type)) continue;

    const defaults = defaultSignatureFieldSize(type);
    const page = clamp(Math.round(Number(v.page) || 1), 1, 200);
    const x = clamp(Math.round(Number(v.x) || 0), 0, 612);
    const y = clamp(Math.round(Number(v.y) || 0), 0, 792);
    const width = clamp(Math.round(Number(v.width) || defaults.width), 24, 300);
    const height = clamp(Math.round(Number(v.height) || defaults.height), 18, 120);
    recipient.fields = [...(recipient.fields ?? []), { type, page, x, y, width, height }];
  }

  if (recipients.some((r) => !(r.fields ?? []).some((f) => f.type === "SIGNATURE"))) {
    redirect(`/app/signatures/${request.id}/prepare?toast_error=Each signer needs at least one Signature field`);
  }

  const fieldCount = recipients.reduce((n, r) => n + (r.fields?.length ?? 0), 0);
  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: { recipients: signatureRecipientsPayload(recipients, meta) as never },
  });

  await audit({
    userId: user.id,
    action: "SIGNATURE_FIELDS_POSITIONED",
    resourceType: "SignatureRequest",
    resourceId: request.id,
    after: { signerCount: recipients.length, fieldCount },
  });

  revalidatePath(`/app/signatures/${request.id}`);
  revalidatePath(`/app/signatures/${request.id}/prepare`);
  redirect(`/app/signatures/${request.id}?toast=Signature field placement saved`);
}
