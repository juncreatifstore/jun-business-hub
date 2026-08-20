import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { shortHash } from "@/lib/hash";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// Print view: browser Print → Save as PDF. Final/signed documents carry the
// verification QR pointing at the public /verify/[documentId] page.
export default async function DocumentPrintPage({ params }: { params: { id: string } }) {
  await requirePermission("DOCUMENT_READ");
  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: { client: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc || doc.versions.length === 0) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org";
  const verifyUrl = `${appUrl}/verify/${doc.documentId}`;
  const showQR = doc.status === "FINAL" || doc.status === "SIGNED";
  const qr = showQR ? await QRCode.toDataURL(verifyUrl, { margin: 1, width: 130 }) : null;

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 print:p-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/app/documents/${doc.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-night shadow-sm hover:bg-surface">
          <ArrowLeft className="h-4 w-4" />
          Back to document
        </Link>
        <span className="text-xs text-muted2">Print / preview mode</span>
      </div>

      <div className="flex items-start justify-between border-b-2 border-night pb-5">
        <div>
          <p className="font-display text-3xl">JUN</p>
          <p className="text-xs text-muted2">JUN CREATIF AND TRAVEL LLC</p>
        </div>
        <div className="text-right text-xs text-muted2">
          <p className="registry-id text-ink">{doc.documentId}</p>
          <p>{doc.type.replaceAll("_", " ")} · {doc.status}</p>
          {doc.finalizedAt ? <p>Finalized {formatDateTime(doc.finalizedAt)}</p> : null}
        </div>
      </div>
      <article className="doc-prose mt-8 text-[15px]" dangerouslySetInnerHTML={{ __html: sanitizeDocumentHtml(doc.versions[0].content) }} />
      <div className="mt-12 flex items-end justify-between border-t border-line pt-5 text-xs text-muted2">
        <div>
          {doc.finalHash ? <p className="registry-id">Integrity SHA-256: {shortHash(doc.finalHash)}</p> : <p>Draft — not yet finalized.</p>}
          {showQR ? <p className="mt-1">Verify at <span className="registry-id text-ink">{verifyUrl}</span></p> : null}
        </div>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Verification QR code" width={110} height={110} />
        ) : null}
      </div>
      <p className="mt-8 text-center text-[10px] text-muted2 print:hidden">Use your browser&apos;s Print → Save as PDF to export.</p>
    </div>
  );
}
