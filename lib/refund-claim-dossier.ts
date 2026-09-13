import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { storage, makeStorageKey } from "@/lib/storage";
import {
  reasonLabel,
  payoutLabel,
  type ClaimDetails,
  type ClaimDecision,
  type InfoRequest,
} from "@/lib/refund-claims";

const ID_LABEL: Record<string, string> = {
  PASSPORT: "Passeport",
  NATIONAL_ID: "Carte d’identité",
  DRIVER_LICENSE: "Permis de conduire",
  RESIDENCE_PERMIT: "Titre de séjour",
};
const METHOD_LABEL: Record<string, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement",
  CARD: "Carte",
  ZELLE: "Zelle",
  PAYPAL: "PayPal",
  MONCASH: "MonCash",
  WESTERN_UNION: "Western Union / MoneyGram",
  OTHER: "Autre",
};
const SERVICE_LABEL: Record<string, string> = {
  VISA: "Visa / immigration",
  TRAVEL: "Voyage",
  DOCUMENTS: "Documents",
  DESIGN: "Création",
  OTHER: "Autre",
};

/** Maps a payment method declared on the form to the hub's PaymentMethod enum. */
export function mapDeclaredMethod(
  m: string,
): "ZELLE" | "PAYPAL" | "BANK_TRANSFER" | "CASH" | "MONCASH" | "OTHER" {
  if (m === "ZELLE" || m === "PAYPAL" || m === "BANK_TRANSFER" || m === "CASH" || m === "MONCASH") return m;
  return "OTHER";
}

/**
 * Builds the "dossier de demande" PDF summarising the client's submission,
 * the checks and the decision, stores it as a Drive file linked to the
 * refund, the client and the case. Returns the file id.
 */
export async function generateClaimDossier(claimId: string, refundId: string, userId: string) {
  const c = await prisma.refundClaim.findUnique({
    where: { id: claimId },
    include: {
      client: { select: { firstName: true, lastName: true, internalId: true, email: true, phone: true } },
      payment: { select: { reference: true, amount: true, currency: true, paidAt: true, status: true } },
      refund: { select: { refundNumber: true, amount: true, currency: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
    },
  });
  if (!c) return null;
  const sub = (c.submission ?? {}) as Partial<ClaimDetails>;
  const d = c.decision as ClaimDecision | null;
  const info = c.infoRequest as InfoRequest | null;
  const files = c.fileIds.length
    ? await prisma.file.findMany({
        where: { id: { in: [...c.fileIds, ...(d?.proofFileIds ?? [])] } },
        select: { id: true, name: true },
      })
    : [];
  const nameOf = (id: string) => files.find((f) => f.id === id)?.name ?? id;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const margin = 48;
  const width = 595 - margin * 2;
  const safe = (v: unknown) => String(v ?? "").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
  const line = (
    text: string,
    opts: { size?: number; b?: boolean; color?: [number, number, number]; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const f = opts.b ? bold : font;
    // wrap
    const words = safe(text).split(" ");
    let cur = "";
    const rows: string[] = [];
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width) {
        rows.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) rows.push(cur);
    for (const r of rows) {
      if (y < 60) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawText(r, {
        x: margin,
        y,
        size,
        font: f,
        color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.12),
      });
      y -= size + 4;
    }
    y -= opts.gap ?? 2;
  };
  const section = (t: string) => {
    y -= 8;
    line(t.toUpperCase(), { size: 9, b: true, color: [0.25, 0.35, 0.8], gap: 4 });
  };
  const kv = (k: string, v: unknown) => line(`${k} : ${safe(v) || "—"}`);
  const money = (a: number | null | undefined, cur?: string | null) =>
    a === null || a === undefined ? "—" : `${cur ?? c.currency ?? ""} ${Number(a).toFixed(2)}`;

  line("JUN CREATIF AND TRAVEL LLC", { size: 9, color: [0.4, 0.4, 0.45] });
  line("Dossier de demande de remboursement", { size: 18, b: true, gap: 2 });
  line(
    `Remboursement ${c.refund?.refundNumber ?? ""} · Demande ${c.id.slice(-8).toUpperCase()} · généré le ${new Date().toLocaleString("fr-FR")}`,
    { size: 9, color: [0.4, 0.4, 0.45], gap: 6 },
  );

  section("Client");
  kv("Nom", `${c.client.firstName} ${c.client.lastName} (${c.client.internalId})`);
  kv("Contact", `${c.contactEmail ?? c.client.email ?? ""} ${c.contactPhone ?? c.client.phone ?? ""}`);
  if (sub.identity) {
    section("Identité déclarée");
    kv("Nom sur la pièce", sub.identity.fullName);
    kv("Date de naissance", sub.identity.dateOfBirth);
    kv("Pièce", `${ID_LABEL[sub.identity.idType] ?? sub.identity.idType} n° ${sub.identity.idNumber}`);
    kv(
      "Pièces jointes",
      (sub.files ?? [])
        .filter((f) => f.role === "ID" || f.role === "SELFIE")
        .map((f) => nameOf(f.fileId))
        .join(" ; "),
    );
  }
  if (sub.payment) {
    section("Paiement déclaré");
    kv("Date", sub.payment.paidOn);
    kv("Montant payé", money(sub.payment.paidAmount, sub.payment.currency));
    kv("Moyen", METHOD_LABEL[sub.payment.method] ?? sub.payment.method);
    kv("Référence", sub.payment.reference);
    kv("Payé à", sub.payment.paidTo);
    kv(
      "Preuves",
      (sub.files ?? [])
        .filter((f) => f.role === "PAYMENT_PROOF")
        .map((f) => nameOf(f.fileId))
        .join(" ; "),
    );
  }
  section("Paiement dans nos registres");
  kv(
    "Paiement",
    c.payment
      ? `${c.payment.reference} · ${money(Number(c.payment.amount), c.payment.currency)} · ${c.payment.status}${c.payment.paidAt ? ` · ${c.payment.paidAt.toLocaleDateString("fr-FR")}` : ""}`
      : "Aucun",
  );
  if (sub.service) {
    section("Service concerné");
    kv("Type", SERVICE_LABEL[sub.service.type] ?? sub.service.type);
    kv("Description", sub.service.description);
    if (sub.service.caseReference) kv("Dossier indiqué", sub.service.caseReference);
    if (sub.service.date) kv("Date prévue", sub.service.date);
  }
  section("Motif");
  kv("Motif principal", reasonLabel(c.reasonCode));
  line(c.reason ?? "");
  kv("Montant demandé", money(c.amount ? Number(c.amount) : null));
  kv("Remboursement intégral demandé", sub.fullRefund ? "oui" : "non");
  const ev = (sub.files ?? []).filter((f) => f.role === "EVIDENCE");
  if (ev.length) kv("Justificatifs", ev.map((f) => nameOf(f.fileId)).join(" ; "));
  section("Mode de remboursement souhaité");
  kv("Mode", payoutLabel(c.payoutMethod));
  const pd = (c.payoutDetails ?? {}) as Record<string, string>;
  if (c.payoutMethod === "BANK_TRANSFER")
    kv(
      "Coordonnées",
      `${pd.bankHolder ?? ""} · ${pd.bankName ?? ""} · ${pd.bankAccount ?? ""} ${pd.bankSwift ? `· ${pd.bankSwift}` : ""}`,
    );
  if (sub.declaration) {
    section("Déclaration sur l’honneur");
    kv(
      "Signée par",
      `${sub.declaration.signature} le ${new Date(sub.declaration.signedAt).toLocaleString("fr-FR")}${sub.declaration.ip ? ` (IP ${sub.declaration.ip})` : ""}`,
    );
  }
  if (info) {
    section("Compléments demandés");
    line(`Demande du ${new Date(info.askedAt).toLocaleString("fr-FR")} : ${info.message}`);
    for (const r of info.replies ?? [])
      line(
        `Réponse du ${new Date(r.at).toLocaleString("fr-FR")} : ${r.text}${r.fileIds.length ? ` (${r.fileIds.map(nameOf).join(" ; ")})` : ""}`,
      );
  }
  section("Décision");
  if (d) {
    kv("Montant demandé", money(d.requestedAmount));
    kv("Montant accepté", money(d.approvedAmount));
    if (d.partialReason) kv("Motif de la retenue", d.partialReason);
    for (const s of d.renderedServices ?? [])
      line(`  • Service rendu : ${s.description} — ${money(s.amount)}`);
    if (d.proofFileIds?.length) kv("Preuves des services rendus", d.proofFileIds.map(nameOf).join(" ; "));
    if (d.note) kv("Note interne", d.note);
    kv("Décidé le", new Date(d.decidedAt).toLocaleString("fr-FR"));
  } else kv("Décision", "Acceptée");
  kv("Responsable", c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}` : "—");
  y -= 10;
  line(
    "Document généré automatiquement par JUN Business Hub à la création du remboursement. Les pièces listées sont conservées dans le Drive du client et rattachées à ce remboursement.",
    { size: 8, color: [0.45, 0.45, 0.5] },
  );

  const bytes = Buffer.from(await pdf.save());
  const name =
    `Dossier de demande — ${c.refund?.refundNumber ?? "REF"} — ${c.client.firstName} ${c.client.lastName}.pdf`.slice(
      0,
      200,
    );
  const key = makeStorageKey("drive", name);
  await storage().upload(key, bytes, "application/pdf");
  const file = await prisma.file.create({
    data: {
      name,
      storageKey: key,
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      category: "REFUND",
      isVault: false,
      clientId: c.clientId,
      caseId: c.caseId,
      refundId,
      uploadedById: userId,
    },
  });
  return file.id;
}
