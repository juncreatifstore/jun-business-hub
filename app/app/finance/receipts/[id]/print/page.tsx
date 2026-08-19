import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatMoney } from "@/lib/utils";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// Printable receipt generated directly from a confirmed payment.
// Use the browser's "Print → Save as PDF" to export it.
export default async function ReceiptPrintPage({ params }: { params: { id: string } }) {
  await requirePermission("PAYMENT_READ");

  const payment = await prisma.payment.findFirst({
    where: {
      OR: [{ id: params.id }, { reference: params.id }],
    },
    include: {
      client: true,
      recordedBy: true,
    },
  });

  if (!payment || payment.status !== "CONFIRMED" || !payment.paidAt) notFound();

  const receiptReference = `RCT-${payment.reference}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org";
  const verifyUrl = `${appUrl}/verify/${receiptReference}`;
  const qr = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 140 });

  return (
    <div className="mx-auto max-w-2xl bg-white p-10 print:p-0">
      <div className="flex items-start justify-between border-b-2 border-night pb-6">
        <div>
          <p className="font-display text-3xl">JUN</p>
          <p className="text-xs text-muted2">JUN CREATIF AND TRAVEL LLC · www.juncreatif.org</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-widest">Receipt</p>
          <p className="registry-id">{receiptReference}</p>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <div>
          <dt className="text-xs text-muted2">Received from</dt>
          <dd className="mt-0.5 font-medium">{payment.client.firstName} {payment.client.lastName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted2">Date</dt>
          <dd className="mt-0.5">{formatDateTime(payment.paidAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted2">Amount</dt>
          <dd className="mt-0.5 text-xl font-semibold">{formatMoney(Number(payment.amount), payment.currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted2">Payment method</dt>
          <dd className="mt-0.5">{payment.method.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted2">Payment reference</dt>
          <dd className="registry-id mt-0.5">{payment.reference}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted2">Handled by</dt>
          <dd className="mt-0.5">{payment.recordedBy.firstName} {payment.recordedBy.lastName}</dd>
        </div>
        {payment.notes ? (
          <div className="col-span-2">
            <dt className="text-xs text-muted2">For</dt>
            <dd className="mt-0.5">{payment.notes}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-10 flex items-end justify-between border-t border-line pt-6">
        <div className="text-xs text-muted2">
          <p>Verify this receipt at</p>
          <p className="registry-id text-ink">{verifyUrl}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Verification QR code" width={110} height={110} />
      </div>

      <p className="mt-8 text-center text-[10px] text-muted2 print:hidden">
        Use your browser&apos;s Print → Save as PDF to export this receipt.
      </p>
    </div>
  );
}
