"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  createRefundClaimLink,
  deliverRefundClaimLink,
  claimUrl,
  notifyClaimDecision,
} from "@/lib/refund-claims";

function back(returnTo: string, key: "toast" | "toast_error", message: string): never {
  const base = returnTo.startsWith("/app/") ? returnTo : "/app/finance/refunds";
  redirect(`${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}

/** Creates and sends a refund-request form link to a client. */
export async function sendRefundClaimForm(formData: FormData): Promise<void> {
  const user = await assertPermission("REFUND_CREATE");
  const clientId = String(formData.get("clientId") ?? "").trim();
  const paymentId = String(formData.get("paymentId") ?? "").trim() || null;
  const caseId = String(formData.get("caseId") ?? "").trim() || null;
  const returnTo = String(formData.get("returnTo") ?? "/app/finance/refunds");
  const channels = ["EMAIL", "WHATSAPP"].filter(
    (c) => formData.get(`via_${c.toLowerCase()}`) === "on",
  ) as Array<"EMAIL" | "WHATSAPP">;
  const message = String(formData.get("message") ?? "").slice(0, 1000) || null;
  const language = String(formData.get("language") ?? "fr") === "en" ? "en" : "fr";
  if (!clientId) back(returnTo, "toast_error", "Client manquant");
  try {
    const claim = await createRefundClaimLink({
      clientId,
      caseId,
      paymentId,
      requestedById: user.id,
      message,
      language,
    });
    await audit({
      userId: user.id,
      action: "REFUND_CLAIM_LINK_CREATED",
      resourceType: "RefundClaim",
      resourceId: claim.id,
      after: { clientId, paymentId, channels },
    });
    const res = channels.length
      ? await deliverRefundClaimLink(claim.id, channels)
      : { sent: [], errors: [], url: claimUrl(claim.token) };
    revalidatePath(returnTo);
    const head = res.sent.length
      ? `Formulaire envoyé par ${res.sent.map((c) => (c === "EMAIL" ? "e-mail" : "WhatsApp")).join(" et ")}`
      : "Lien créé";
    back(
      returnTo,
      res.errors.length && !res.sent.length ? "toast_error" : "toast",
      `${[head, ...res.errors].join(" · ")} — ${res.url}`,
    );
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    back(returnTo, "toast_error", e instanceof Error ? e.message : "Envoi impossible");
  }
}

export async function markClaimUnderReview(formData: FormData): Promise<void> {
  const user = await assertPermission("REFUND_READ");
  const id = String(formData.get("id") ?? "");
  await prisma.refundClaim.updateMany({
    where: { id, status: "SUBMITTED" },
    data: { status: "UNDER_REVIEW" },
  });
  await audit({
    userId: user.id,
    action: "REFUND_CLAIM_REVIEW",
    resourceType: "RefundClaim",
    resourceId: id,
  });
  revalidatePath(`/app/finance/refunds/claims/${id}`);
  redirect(`/app/finance/refunds/claims/${id}?toast=${encodeURIComponent("Marquée en cours d’examen")}`);
}

export async function rejectClaim(formData: FormData): Promise<void> {
  const user = await assertPermission("REFUND_APPROVE");
  const id = String(formData.get("id") ?? "");
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 1000) || null;
  const claim = await prisma.refundClaim.findUnique({ where: { id }, select: { status: true } });
  if (!claim || !["SUBMITTED", "UNDER_REVIEW"].includes(claim.status))
    redirect(
      `/app/finance/refunds/claims/${id}?toast_error=${encodeURIComponent("Cette demande ne peut plus être refusée")}`,
    );
  await prisma.refundClaim.update({
    where: { id },
    data: { status: "REJECTED", decisionNote: note, decidedById: user.id, decidedAt: new Date() },
  });
  await audit({
    userId: user.id,
    action: "REFUND_CLAIM_REJECTED",
    resourceType: "RefundClaim",
    resourceId: id,
    after: { note },
  });
  await notifyClaimDecision(id, "REJECTED", note).catch(() => null);
  revalidatePath("/app/finance/refunds");
  redirect(
    `/app/finance/refunds/claims/${id}?toast=${encodeURIComponent("Demande refusée, client informé")}`,
  );
}

/** Links a created Refund to the claim (called after creation from the prefilled form). */
export async function attachRefundToClaim(claimId: string, refundId: string, userId: string) {
  await prisma.refundClaim.updateMany({
    where: { id: claimId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
    data: { status: "CONVERTED", refundId, decidedById: userId, decidedAt: new Date() },
  });
  await notifyClaimDecision(claimId, "CONVERTED", null).catch(() => null);
}
