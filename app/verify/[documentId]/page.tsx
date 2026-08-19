import { prisma } from "@/lib/prisma";
import { shortHash } from "@/lib/hash";
import { formatDateTime } from "@/lib/utils";
import { ShieldCheck, ShieldX } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Document verification" };

// Public verification page. Deliberately exposes ONLY registry metadata:
// reference, type, dates, status, partial integrity hash and signature status.
// It never exposes document contents, client names or payment amounts.
export default async function VerifyPage({ params }: { params: { documentId: string } }) {
  const id = decodeURIComponent(params.documentId).slice(0, 60);

  const doc = await prisma.document.findUnique({
    where: { documentId: id },
    select: {
      documentId: true,
      type: true,
      status: true,
      createdAt: true,
      finalizedAt: true,
      finalHash: true,
      signatures: {
        select: { status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // Receipts are generated from confirmed payments; there is no Receipt model.
  // Public receipt references use the deterministic form RCT-<payment reference>.
  const paymentReference = !doc && id.startsWith("RCT-") ? id.slice(4) : null;
  const receiptPayment = paymentReference
    ? await prisma.payment.findUnique({
        where: { reference: paymentReference },
        select: { reference: true, status: true, paidAt: true },
      })
    : null;

  const validReceipt = Boolean(
    receiptPayment &&
      receiptPayment.status === "CONFIRMED" &&
      receiptPayment.paidAt,
  );

  const authentic = Boolean(
    (doc && (doc.status === "FINAL" || doc.status === "SIGNED")) || validReceipt,
  );

  return (
    <div className="flex min-h-screen flex-col bg-night text-white">
      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-16">
        <Link href="/" className="font-display text-2xl">JUN</Link>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/40">Document verification</p>

        <div className={`mt-10 rounded-2xl border p-8 ${authentic ? "border-emerald-400/40 bg-emerald-400/5" : "border-red-400/40 bg-red-400/5"}`}>
          {authentic ? (
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-emerald-400" />
              <div>
                <p className="text-lg font-semibold text-emerald-300">Authentic</p>
                <p className="text-sm text-white/60">This reference exists in the JUN registry.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <ShieldX className="h-8 w-8 text-red-400" />
              <div>
                <p className="text-lg font-semibold text-red-300">Invalid or not verifiable</p>
                <p className="text-sm text-white/60">
                  No final document or confirmed receipt with this reference exists in the JUN registry. If you received a
                  document claiming this ID, contact us before relying on it.
                </p>
              </div>
            </div>
          )}

          <dl className="mt-8 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-white/50">Reference</dt><dd className="registry-id">{id}</dd></div>
            {doc ? (
              <>
                <div className="flex justify-between gap-4"><dt className="text-white/50">Type</dt><dd>{doc.type.replaceAll("_", " ")}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/50">Status</dt><dd>{doc.status}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/50">Created</dt><dd>{formatDateTime(doc.createdAt)}</dd></div>
                {doc.finalizedAt ? <div className="flex justify-between gap-4"><dt className="text-white/50">Finalized</dt><dd>{formatDateTime(doc.finalizedAt)}</dd></div> : null}
                {doc.finalHash ? <div className="flex justify-between gap-4"><dt className="text-white/50">Integrity hash</dt><dd className="registry-id">{shortHash(doc.finalHash)}</dd></div> : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-white/50">Signature</dt>
                  <dd>{doc.signatures[0]?.status.replaceAll("_", " ") ?? "Not requested"}</dd>
                </div>
              </>
            ) : validReceipt && receiptPayment ? (
              <>
                <div className="flex justify-between gap-4"><dt className="text-white/50">Type</dt><dd>Payment receipt</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/50">Status</dt><dd>CONFIRMED</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/50">Paid</dt><dd>{formatDateTime(receiptPayment.paidAt)}</dd></div>
              </>
            ) : null}
          </dl>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          This page shows only registry metadata. Document contents remain private.
        </p>
      </div>
    </div>
  );
}
