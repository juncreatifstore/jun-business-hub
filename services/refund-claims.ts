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
  requestClaimInformation,
  type ClaimDecision,
} from "@/lib/refund-claims";
import { Prisma } from "@prisma/client";
import { storage, makeStorageKey } from "@/lib/storage";
import { nextNumber } from "@/lib/sequence";
import { logActivity } from "@/lib/audit";
import { generateClaimDossier, mapDeclaredMethod } from "@/lib/refund-claim-dossier";
import { assertFinancialPeriodOpen } from "@/lib/company-funds-monthly-close";
import type { ClaimDetails, InfoRequest } from "@/lib/refund-claims";

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
  const res = await prisma.refundClaim.updateMany({
    where: { id: claimId, status: { in: ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO"] } },
    data: { status: "CONVERTED", refundId, decidedById: userId, decidedAt: new Date() },
  });
  if (!res.count) return;
  // Every document of the claim (client uploads, complements, staff proofs) is attached to the refund file.
  const c = await prisma.refundClaim.findUnique({
    where: { id: claimId },
    select: { fileIds: true, decision: true, infoRequest: true },
  });
  const ids = new Set<string>(c?.fileIds ?? []);
  for (const id of (c?.decision as ClaimDecision | null)?.proofFileIds ?? []) ids.add(id);
  for (const r of (c?.infoRequest as InfoRequest | null)?.replies ?? [])
    for (const id of r.fileIds) ids.add(id);
  if (ids.size) await prisma.file.updateMany({ where: { id: { in: Array.from(ids) } }, data: { refundId } });
  await generateClaimDossier(claimId, refundId, userId).catch(() => null);
  await notifyClaimDecision(claimId, "CONVERTED", null).catch(() => null);
}

/**
 * The client declared a payment that the hub never recorded: creates it as a
 * PENDING payment from the declaration (date, amount, method, reference,
 * paid to), attaches the proof files, links the claim to it. Confirmation
 * follows the usual PAYMENT_APPROVE flow.
 */
export async function registerPaymentFromClaim(formData: FormData): Promise<void> {
  const user = await assertPermission("PAYMENT_CREATE");
  const id = String(formData.get("id") ?? "");
  const c = await prisma.refundClaim.findUnique({
    where: { id },
    include: { client: { select: { firstName: true, lastName: true } } },
  });
  const fail = (m: string): never =>
    redirect(`/app/finance/refunds/claims/${id}?toast_error=${encodeURIComponent(m)}`);
  if (!c) return fail("Demande introuvable");
  if (c.paymentId) return fail("Un paiement est déjà rattaché à cette demande");
  const sub = (c.submission ?? {}) as Partial<ClaimDetails>;
  if (!sub.payment) return fail("Le client n’a pas déclaré de paiement");
  const paidAt = new Date(sub.payment.paidOn);
  if (Number.isNaN(paidAt.getTime())) return fail("Date de paiement invalide");
  try {
    await assertFinancialPeriodOpen(paidAt);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Période financière fermée");
  }
  const reference = await nextNumber("PAY");
  const method = mapDeclaredMethod(sub.payment.method);
  const notes = [
    `Déclaré par le client via la demande de remboursement ${c.id.slice(-8).toUpperCase()}.`,
    `Moyen déclaré : ${sub.payment.method}. Référence client : ${sub.payment.reference || "—"}. Payé à : ${sub.payment.paidTo}.`,
    sub.service ? `Service : ${sub.service.type} — ${sub.service.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const payment = await prisma.payment.create({
    data: {
      reference,
      clientId: c.clientId,
      caseId: c.caseId,
      amount: new Prisma.Decimal(Number(sub.payment.paidAmount).toFixed(2)),
      currency: (sub.payment.currency || c.currency || "USD").toUpperCase(),
      method,
      status: "PENDING",
      providerRef: sub.payment.reference || null,
      paidAt,
      notes,
      recordedById: user.id,
    },
  });
  const proofIds = (sub.files ?? []).filter((f) => f.role === "PAYMENT_PROOF").map((f) => f.fileId);
  if (proofIds.length)
    await prisma.file.updateMany({ where: { id: { in: proofIds } }, data: { paymentId: payment.id } });
  await prisma.refundClaim.update({ where: { id }, data: { paymentId: payment.id } });
  await audit({
    userId: user.id,
    action: "PAYMENT_CREATE",
    resourceType: "Payment",
    resourceId: payment.id,
    after: { reference, source: "REFUND_CLAIM", claimId: id, amount: Number(sub.payment.paidAmount), method },
  });
  await logActivity({
    type: "PAYMENT_CREATED",
    message: `Paiement ${reference} enregistré depuis la déclaration du client (${payment.currency} ${Number(payment.amount).toFixed(2)}) — à confirmer`,
    userId: user.id,
    clientId: c.clientId,
    caseId: c.caseId,
  });
  revalidatePath(`/app/finance/refunds/claims/${id}`);
  redirect(
    `/app/finance/refunds/claims/${id}?toast=${encodeURIComponent(`Paiement ${reference} enregistré (en attente de confirmation) et rattaché à la demande`)}`,
  );
}

export async function assignClaim(formData: FormData): Promise<void> {
  const user = await assertPermission("REFUND_READ");
  const id = String(formData.get("id") ?? "");
  const assignedToId = String(formData.get("assignedToId") ?? "").trim() || null;
  await prisma.refundClaim.update({ where: { id }, data: { assignedToId } });
  if (assignedToId && assignedToId !== user.id)
    await prisma.notification
      .create({
        data: {
          userId: assignedToId,
          type: "REFUND_CLAIM_ASSIGNED",
          title: "Demande de remboursement assignée",
          body: `Vous êtes responsable de la demande ${id.slice(-8).toUpperCase()}`,
        },
      })
      .catch(() => null);
  await audit({
    userId: user.id,
    action: "REFUND_CLAIM_ASSIGNED",
    resourceType: "RefundClaim",
    resourceId: id,
    after: { assignedToId },
  });
  revalidatePath(`/app/finance/refunds/claims/${id}`);
  redirect(
    `/app/finance/refunds/claims/${id}?toast=${encodeURIComponent(assignedToId ? "Responsable défini" : "Assignation retirée")}`,
  );
}

export async function askClaimInformation(formData: FormData): Promise<void> {
  const user = await assertPermission("REFUND_READ");
  const id = String(formData.get("id") ?? "");
  const message = String(formData.get("message") ?? "")
    .trim()
    .slice(0, 1500);
  const steps = formData.getAll("steps").map(String).filter(Boolean);
  if (message.length < 5)
    redirect(
      `/app/finance/refunds/claims/${id}?toast_error=${encodeURIComponent("Précisez ce que vous demandez au client")}`,
    );
  await requestClaimInformation(id, user.id, message, steps);
  await audit({
    userId: user.id,
    action: "REFUND_CLAIM_INFO_REQUESTED",
    resourceType: "RefundClaim",
    resourceId: id,
    after: { steps },
  });
  revalidatePath(`/app/finance/refunds/claims/${id}`);
  redirect(`/app/finance/refunds/claims/${id}?toast=${encodeURIComponent("Complément demandé au client")}`);
}

/**
 * Records the decision (full or partial amount, reason for the deduction,
 * services already delivered with amounts, staff proof files) and moves on
 * to the refund form pre-filled with the approved amount.
 */
export async function decideClaimAmount(formData: FormData): Promise<void> {
  const user = await assertPermission("REFUND_CREATE");
  const id = String(formData.get("id") ?? "");
  const c = await prisma.refundClaim.findUnique({
    where: { id },
    include: { client: { select: { firstName: true, lastName: true } } },
  });
  if (!c || !c.amount)
    redirect(`/app/finance/refunds/claims/${id}?toast_error=${encodeURIComponent("Demande introuvable")}`);
  const requested = Number(c.amount);
  const approved = Number(String(formData.get("approvedAmount") ?? "").replace(",", "."));
  if (!Number.isFinite(approved) || approved <= 0 || approved > requested + 0.005)
    redirect(
      `/app/finance/refunds/claims/${id}?toast_error=${encodeURIComponent("Montant accepté invalide (0 < montant ≤ demandé)")}`,
    );
  const partial = approved < requested - 0.005;
  const partialReason =
    String(formData.get("partialReason") ?? "")
      .trim()
      .slice(0, 1500) || null;
  const services: ClaimDecision["renderedServices"] = [];
  for (let i = 0; i < 8; i++) {
    const desc = String(formData.get(`svc${i}_desc`) ?? "")
      .trim()
      .slice(0, 200);
    const amt = Number(String(formData.get(`svc${i}_amount`) ?? "").replace(",", "."));
    if (desc && Number.isFinite(amt) && amt > 0)
      services.push({ description: desc, amount: Math.round(amt * 100) / 100 });
  }
  if (partial && !partialReason)
    redirect(
      `/app/finance/refunds/claims/${id}?toast_error=${encodeURIComponent("Indiquez la raison de la retenue")}`,
    );
  // Staff proof files (services delivered) → Drive, linked to the client
  const proofFileIds: string[] = [];
  const uploads = formData
    .getAll("proofs")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 6);
  for (const [i, f] of uploads.entries()) {
    if (f.size > 15 * 1024 * 1024) continue;
    const key = makeStorageKey("drive", f.name);
    await storage().upload(key, Buffer.from(await f.arrayBuffer()), f.type || "application/octet-stream");
    const file = await prisma.file.create({
      data: {
        name: `Preuve de service rendu ${uploads.length > 1 ? i + 1 : ""} — remboursement — ${c.client.firstName} ${c.client.lastName}`
          .replace(/\s+/g, " ")
          .slice(0, 200),
        storageKey: key,
        mimeType: f.type || "application/octet-stream",
        sizeBytes: f.size,
        category: "REFUND",
        isVault: false,
        clientId: c.clientId,
        caseId: c.caseId,
        uploadedById: user.id,
      },
    });
    proofFileIds.push(file.id);
  }
  const decision: ClaimDecision = {
    approvedAmount: Math.round(approved * 100) / 100,
    requestedAmount: requested,
    partialReason: partial ? partialReason : null,
    renderedServices: services,
    proofFileIds,
    note:
      String(formData.get("note") ?? "")
        .trim()
        .slice(0, 1000) || null,
    decidedAt: new Date().toISOString(),
    decidedById: user.id,
  };
  await prisma.refundClaim.update({
    where: { id },
    data: {
      decision: decision as unknown as Prisma.InputJsonValue,
      status: "UNDER_REVIEW",
      assignedToId: c.assignedToId ?? user.id,
    },
  });
  await audit({
    userId: user.id,
    action: "REFUND_CLAIM_DECIDED",
    resourceType: "RefundClaim",
    resourceId: id,
    after: { approved: decision.approvedAmount, requested, partial, services: services.length },
  });
  const reason = `${partial ? `Remboursement partiel (${c.currency} ${decision.approvedAmount.toFixed(2)} sur ${requested.toFixed(2)}) — ${partialReason}` : "Remboursement intégral accepté"}${services.length ? ` — services rendus : ${services.map((s) => `${s.description} (${s.amount.toFixed(2)})`).join(", ")}` : ""} — demande client : ${c.reason ?? ""}`;
  redirect(
    `/app/finance/refunds/new?clientId=${c.clientId}${c.paymentId ? `&paymentId=${c.paymentId}` : ""}${c.caseId ? `&caseId=${c.caseId}` : ""}&amount=${decision.approvedAmount}&reason=${encodeURIComponent(reason.slice(0, 1900))}&claimId=${c.id}`,
  );
}

/** Confirms the claim's pending payment (usual PAYMENT_APPROVE flow) and returns to the claim. */
export async function confirmClaimPayment(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const { confirmPayment } = await import("@/services/finance");
  await confirmPayment(paymentId);
  revalidatePath(`/app/finance/refunds/claims/${id}`);
  redirect(`/app/finance/refunds/claims/${id}?toast=${encodeURIComponent("Paiement confirmé")}`);
}
