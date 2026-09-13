"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  createPaymentRequest,
  deliverPaymentRequest,
  paymentRequestUrl,
  savePaymentInstructions,
  markPaymentRequestPaid,
  PAY_METHODS,
  type PaymentInstructions,
} from "@/lib/payment-requests";

function back(returnTo: string, key: "toast" | "toast_error", message: string): never {
  const base = returnTo.startsWith("/app/") ? returnTo : "/app/finance/payments";
  redirect(`${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}

export async function sendPaymentRequest(formData: FormData): Promise<void> {
  const user = await assertPermission("PAYMENT_CREATE");
  const returnTo = String(formData.get("returnTo") ?? "/app/finance/payments");
  const clientId = String(formData.get("clientId") ?? "").trim();
  const caseId = String(formData.get("caseId") ?? "").trim() || null;
  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));
  const currency =
    String(formData.get("currency") ?? "USD")
      .trim()
      .toUpperCase()
      .slice(0, 3) || "USD";
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, 200);
  const message = String(formData.get("message") ?? "").slice(0, 1000) || null;
  const language = String(formData.get("language") ?? "fr") === "en" ? "en" : "fr";
  const allowedMethods = formData
    .getAll("methods")
    .map(String)
    .filter((m) => PAY_METHODS.some((x) => x.code === m));
  const onlineUrl = String(formData.get("onlineUrl") ?? "").trim() || null;
  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  const dueAt = dueRaw ? new Date(dueRaw) : null;
  const channels = ["EMAIL", "WHATSAPP"].filter(
    (c) => formData.get(`via_${c.toLowerCase()}`) === "on",
  ) as Array<"EMAIL" | "WHATSAPP">;
  if (!clientId || !Number.isFinite(amount) || amount <= 0 || description.length < 3)
    back(returnTo, "toast_error", "Client, montant et libellé sont requis");
  if (onlineUrl && !/^https?:\/\//.test(onlineUrl))
    back(returnTo, "toast_error", "Lien de paiement en ligne invalide");
  try {
    const r = await createPaymentRequest({
      clientId,
      caseId,
      requestedById: user.id,
      amount,
      currency,
      description,
      message,
      language,
      allowedMethods,
      onlineUrl,
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
    });
    await audit({
      userId: user.id,
      action: "PAYMENT_REQUEST_CREATED",
      resourceType: "PaymentRequest",
      resourceId: r.id,
      after: { clientId, amount, currency, description, channels },
    });
    const res = channels.length
      ? await deliverPaymentRequest(r.id, channels)
      : { sent: [], errors: [], url: paymentRequestUrl(r.token) };
    revalidatePath(returnTo);
    const head = res.sent.length
      ? `Demande envoyée par ${res.sent.map((c) => (c === "EMAIL" ? "e-mail" : "WhatsApp")).join(" et ")}`
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

export async function remindPaymentRequest(formData: FormData): Promise<void> {
  const user = await assertPermission("PAYMENT_CREATE");
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/app/finance/payments");
  const r = await prisma.paymentRequest.findUnique({ where: { id }, select: { sentVia: true } });
  const res = await deliverPaymentRequest(
    id,
    (r?.sentVia.length ? r.sentVia : ["EMAIL"]) as Array<"EMAIL" | "WHATSAPP">,
    true,
  );
  await audit({
    userId: user.id,
    action: "PAYMENT_REQUEST_REMINDED",
    resourceType: "PaymentRequest",
    resourceId: id,
    after: { sent: res.sent },
  });
  back(
    returnTo,
    res.sent.length ? "toast" : "toast_error",
    res.sent.length ? "Rappel envoyé" : res.errors.join(" · ") || "Envoi impossible",
  );
}

export async function cancelPaymentRequest(formData: FormData): Promise<void> {
  const user = await assertPermission("PAYMENT_CREATE");
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/app/finance/payments");
  await prisma.paymentRequest.updateMany({
    where: { id, status: { in: ["SENT", "VIEWED"] } },
    data: { status: "CANCELLED", remindAt: null },
  });
  await audit({
    userId: user.id,
    action: "PAYMENT_REQUEST_CANCELLED",
    resourceType: "PaymentRequest",
    resourceId: id,
  });
  back(returnTo, "toast", "Demande annulée");
}

/** Confirms the PENDING payment created from the client's proof (usual flow) and closes the request. */
export async function confirmPaymentRequestPayment(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const r = await prisma.paymentRequest.findUnique({ where: { id }, select: { paymentId: true } });
  if (!r?.paymentId)
    redirect(
      `/app/finance/payments/requests/${id}?toast_error=${encodeURIComponent("Aucun paiement à confirmer")}`,
    );
  const { confirmPayment } = await import("@/services/finance");
  await confirmPayment(r.paymentId);
  await markPaymentRequestPaid(r.paymentId).catch(() => null);
  revalidatePath("/app/finance/payments");
  redirect(
    `/app/finance/payments/requests/${id}?toast=${encodeURIComponent("Paiement confirmé, reçu émis, client informé")}`,
  );
}

export async function savePaymentInstructionsAction(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const v: PaymentInstructions = {};
  for (const m of PAY_METHODS) {
    const t = String(formData.get(`instr_${m.code}`) ?? "")
      .trim()
      .slice(0, 1500);
    if (t) v[m.code] = t;
  }
  await savePaymentInstructions(v);
  await audit({
    userId: user.id,
    action: "PAYMENT_INSTRUCTIONS_UPDATED",
    resourceType: "AppSetting",
    resourceId: "finance.payment_instructions",
  });
  redirect(`/app/finance/payments?toast=${encodeURIComponent("Instructions de paiement enregistrées")}`);
}
