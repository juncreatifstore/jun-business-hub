import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatMoney } from "@/lib/utils";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// Printable receipt: use the browser's "Print → Save as PDF".
// Carries the JUN letterhead and (when linked to a receipt document) a verify QR.
export default async function ReceiptPrintPage({ params }: { params: { id: string } }) {
  await requirePermission("PAYMENT_READ");
  const r = await prisma.receipt.findUnique({
    where: { id: params.id },
    include: { client: true, payment: { include: { createdBy: true } } },
  });
  if (!r) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org";
  const verifyUrl = `${appUrl}/verify/${r.reference}`;
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
          <p className="registry-id">{r.reference}</p>
        </div>
      </div>
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <div><dt className="text-xs text-muted2">Received from</dt><dd className="mt-0.5 font-medium">{r.client.firstName} {r.client.lastName}</dd></div>
        <div><dt className="text-xs text-muted2">Date</dt><dd className="mt-0.5">{formatDateTime(r.issuedAt)}</dd></div>
        <div><dt className="text-xs text-muted2">Amount</dt><dd className="mt-0.5 text-xl font-semibold">{formatMoney(Number(r.amount), r.currency)}</dd></div>
        <div><dt className="text-xs text-muted2">Payment method</dt><dd className="mt-0.5">{r.payment.method.replaceAll("_", " ")}</dd></div>
        <div><dt className="text-xs text-muted2">Payment reference</dt><dd className="registry-id mt-0.5">{r.payment.reference}</dd></div>
        <div><dt className="text-xs text-muted2">Handled by</dt><dd className="mt-0.5">{r.payment.createdBy.firstName} {r.payment.createdBy.lastName}</dd></div>
        {r.reason ? <div className="col-span-2"><dt className="text-xs text-muted2">For</dt><dd className="mt-0.5">{r.reason}</dd></div> : null}
      </dl>
      <div className="mt-10 flex items-end justify-between border-t border-line pt-6">
        <div className="text-xs text-muted2">
          <p>Verify this receipt at</p>
          <p className="registry-id text-ink">{verifyUrl}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Verification QR code" width={110} height={110} />
      </div>
      <p className="mt-8 text-center text-[10px] text-muted2 print:hidden">Use your browser&apos;s Print → Save as PDF to export this receipt.</p>
    </div>
  );
}
