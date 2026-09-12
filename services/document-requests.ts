"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createDocumentRequest, deliverDocumentRequest, requestUrl } from "@/lib/document-requests";
import { docTypeOf, type DocType } from "@/lib/file-extraction";

function back(returnTo: string, key: "toast" | "toast_error", message: string): never {
  const base = returnTo.startsWith("/app/") ? returnTo : "/app/drive/clients";
  redirect(`${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}

/** Creates a request for the missing documents and sends it by the chosen channels. */
export async function requestDocuments(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const clientId = String(formData.get("clientId") ?? "").trim();
  const caseId = String(formData.get("caseId") ?? "").trim() || null;
  const returnTo = String(formData.get("returnTo") ?? "/app/drive/clients");
  const channels = ["EMAIL", "WHATSAPP"].filter(
    (c) => formData.get(`via_${c.toLowerCase()}`) === "on",
  ) as Array<"EMAIL" | "WHATSAPP">;
  const includeOptional = formData.get("includeOptional") === "on";
  const message = String(formData.get("message") ?? "").slice(0, 1000) || null;
  const language = String(formData.get("language") ?? "fr") === "en" ? "en" : "fr";
  const explicit = formData
    .getAll("docType")
    .map((v) => docTypeOf(v))
    .filter((t): t is DocType => t !== "OTHER");
  if (!clientId) back(returnTo, "toast_error", "Client manquant");
  try {
    const r = await createDocumentRequest({
      clientId,
      caseId,
      requestedById: user.id,
      docTypes: explicit.length ? explicit : undefined,
      includeOptional,
      message,
      language,
    });
    await audit({
      userId: user.id,
      action: "DOCUMENT_REQUEST_CREATED",
      resourceType: "DocumentRequest",
      resourceId: r.id,
      after: { clientId, caseId, items: r.items, channels },
    });
    const res = channels.length
      ? await deliverDocumentRequest(r.id, channels)
      : { sent: [], errors: [], url: requestUrl(r.token) };
    revalidatePath(returnTo);
    const parts = [
      res.sent.length
        ? `Demande envoyée par ${res.sent.map((c) => (c === "EMAIL" ? "e-mail" : "WhatsApp")).join(" et ")}`
        : "Demande créée",
      ...res.errors,
    ];
    back(
      returnTo,
      res.errors.length && !res.sent.length ? "toast_error" : "toast",
      `${parts.join(" · ")} — lien : ${res.url}`,
    );
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    back(returnTo, "toast_error", e instanceof Error ? e.message : "Demande impossible");
  }
}

export async function resendDocumentRequest(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/app/drive/clients");
  const channels = ["EMAIL", "WHATSAPP"].filter(
    (c) => formData.get(`via_${c.toLowerCase()}`) === "on",
  ) as Array<"EMAIL" | "WHATSAPP">;
  try {
    const res = await deliverDocumentRequest(id, channels.length ? channels : ["EMAIL"], true);
    await audit({
      userId: user.id,
      action: "DOCUMENT_REQUEST_RESENT",
      resourceType: "DocumentRequest",
      resourceId: id,
      after: { sent: res.sent },
    });
    revalidatePath(returnTo);
    back(
      returnTo,
      res.sent.length ? "toast" : "toast_error",
      res.sent.length ? "Rappel envoyé" : res.errors.join(" · ") || "Envoi impossible",
    );
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    back(returnTo, "toast_error", e instanceof Error ? e.message : "Envoi impossible");
  }
}

export async function cancelDocumentRequest(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/app/drive/clients");
  await prisma.documentRequest.updateMany({
    where: { id, status: { in: ["PENDING", "PARTIAL"] } },
    data: { status: "CANCELLED", remindAt: null },
  });
  await audit({
    userId: user.id,
    action: "DOCUMENT_REQUEST_CANCELLED",
    resourceType: "DocumentRequest",
    resourceId: id,
  });
  revalidatePath(returnTo);
  back(returnTo, "toast", "Demande annulée");
}
