import { Link2, Mail, MessageCircle, Send, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { parseItems, requestUrl, docLabel } from "@/lib/document-requests";
import { requestDocuments, resendDocumentRequest, cancelDocumentRequest } from "@/services/document-requests";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import type { DocType } from "@/lib/file-extraction";

/**
 * "Request documents" form + list of open requests. Used on the case page
 * (missing pieces of the checklist) and on the client documents page.
 */
export async function DocumentRequestsPanel({
  clientId,
  caseId,
  returnTo,
  missing,
  hasEmail,
  hasWhatsApp,
  compact = false,
}: {
  clientId: string;
  caseId?: string | null;
  returnTo: string;
  /** Pieces that would be requested (case checklist or client-level missing). */
  missing: DocType[];
  hasEmail: boolean;
  hasWhatsApp: boolean;
  compact?: boolean;
}) {
  const requests = await prisma.documentRequest.findMany({
    where: { clientId, ...(caseId ? { caseId } : {}), status: { in: ["PENDING", "PARTIAL", "COMPLETE"] } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const badge = (s: string) =>
    s === "COMPLETE"
      ? "bg-emerald-50 text-emerald-700"
      : s === "PARTIAL"
        ? "bg-amber-50 text-amber-800"
        : "bg-surface text-muted2";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {missing.length ? (
        <form action={requestDocuments} className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <input type="hidden" name="clientId" value={clientId} />
          {caseId ? <input type="hidden" name="caseId" value={caseId} /> : null}
          <input type="hidden" name="returnTo" value={returnTo} />
          {missing.map((t) => (
            <input key={t} type="hidden" name="docType" value={t} />
          ))}
          <div className="text-sm font-medium">
            Request the {missing.length} missing document{missing.length > 1 ? "s" : ""} from the client
          </div>
          <div className="flex flex-wrap gap-1">
            {missing.map((t) => (
              <span key={t} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-ink">
                {docLabel(t, "fr")}
              </span>
            ))}
          </div>
          <textarea
            name="message"
            rows={2}
            placeholder="Message personnel (facultatif)…"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className={`inline-flex items-center gap-1.5 ${hasEmail ? "" : "opacity-50"}`}>
              <input type="checkbox" name="via_email" defaultChecked={hasEmail} disabled={!hasEmail} />{" "}
              <Mail className="h-3.5 w-3.5" /> E-mail
              {!hasEmail ? " (no address)" : ""}
            </label>
            <label className={`inline-flex items-center gap-1.5 ${hasWhatsApp ? "" : "opacity-50"}`}>
              <input type="checkbox" name="via_whatsapp" defaultChecked={false} disabled={!hasWhatsApp} />{" "}
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp{!hasWhatsApp ? " (no number)" : ""}
            </label>
            <label className="inline-flex items-center gap-1.5">
              <select
                name="language"
                defaultValue="fr"
                className="h-7 rounded-md border border-line bg-white px-1.5"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            <button className="ml-auto inline-flex items-center gap-1 rounded-lg bg-electric px-3 py-1.5 text-xs font-medium text-white">
              <Send className="h-3.5 w-3.5" /> Send request
            </button>
          </div>
          <p className="text-[11px] text-muted2">
            The client gets a secure upload link (no account). Files land in this file, typed automatically.
            Reminders at +3 and +7 days while pieces are missing.
          </p>
        </form>
      ) : null}

      {requests.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {requests.map((r) => {
            const items = parseItems(r.items);
            const got = items.filter((i) => i.fileId).length;
            const url = requestUrl(r.token);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-medium ${badge(r.status)}`}>
                  {r.status.toLowerCase()}
                </span>
                <span className="text-muted2">
                  {got}/{items.length} received · sent {r.createdAt.toLocaleDateString("fr-FR")}
                  {r.sentVia.length
                    ? ` via ${r.sentVia.map((v) => (v === "EMAIL" ? "e-mail" : "WhatsApp")).join(", ")}`
                    : ""}
                  {r.reminderCount ? ` · ${r.reminderCount} reminder${r.reminderCount > 1 ? "s" : ""}` : ""}
                  {r.lastViewedAt ? ` · opened ${r.lastViewedAt.toLocaleDateString("fr-FR")}` : ""}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <CopyLinkButton url={url} />
                  {r.status !== "COMPLETE" ? (
                    <>
                      <form action={resendDocumentRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        {r.sentVia.includes("EMAIL") || !r.sentVia.length ? (
                          <input type="hidden" name="via_email" value="on" />
                        ) : null}
                        {r.sentVia.includes("WHATSAPP") ? (
                          <input type="hidden" name="via_whatsapp" value="on" />
                        ) : null}
                        <button
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 hover:bg-surface"
                          title="Send a reminder now"
                        >
                          <Send className="h-3.5 w-3.5" /> Remind
                        </button>
                      </form>
                      <form action={cancelDocumentRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-muted2 hover:bg-red-50 hover:text-red-700"
                          title="Cancel this request"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </>
                  ) : null}
                </span>
                <div className="flex w-full flex-wrap gap-1 pl-0.5">
                  {items.map((i, idx) => (
                    <span
                      key={idx}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${i.fileId ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted2"}`}
                    >
                      {docLabel(i.docType, "fr")}
                      {i.fileId ? " ✓" : ""}
                    </span>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted2">
                    <Link2 className="h-3 w-3" /> {url.replace(/^https?:\/\//, "")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
