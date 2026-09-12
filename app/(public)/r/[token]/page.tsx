import { notFound } from "next/navigation";
import { getPublicRequest, docLabel } from "@/lib/document-requests";
import { RequestUploader } from "./uploader";

export const dynamic = "force-dynamic";

export default async function DocumentRequestPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const r = await getPublicRequest(token);
  if (!r) notFound();
  const fr = r.language === "fr";
  const items = r.items.map((i, index) => ({
    index,
    label: docLabel(i.docType, r.language),
    required: i.required,
    received: Boolean(i.fileId),
    fileName: i.fileName ?? null,
  }));

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-electric">JUN Creatif &amp; Travel</p>
      <h1 className="mt-2 text-3xl font-semibold">
        {fr
          ? `Bonjour ${r.firstName}, voici les documents attendus`
          : `Hello ${r.firstName}, here are the documents we need`}
      </h1>
      <p className="mt-3 text-muted2">
        {fr
          ? "Déposez chaque document ci-dessous (photo ou PDF, 15 Mo max). Vos fichiers sont transmis de façon sécurisée et directement rangés dans votre dossier."
          : "Upload each document below (photo or PDF, 15 MB max). Files are transferred securely straight into your file."}
      </p>
      {r.message ? (
        <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm">{r.message}</div>
      ) : null}
      {r.cancelled ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {fr
            ? "Cette demande a été annulée. Contactez-nous si besoin."
            : "This request was cancelled. Contact us if needed."}
        </div>
      ) : r.expired ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {fr
            ? "Ce lien a expiré. Écrivez-nous et nous vous en enverrons un nouveau."
            : "This link has expired. Contact us and we will send a new one."}
        </div>
      ) : (
        <RequestUploader token={token} items={items} language={r.language} />
      )}
      <p className="mt-10 text-xs text-muted2">
        {fr ? "Lien valable jusqu’au " : "Link valid until "}
        {r.expiresAt.toLocaleDateString(fr ? "fr-FR" : "en-US")}.
      </p>
    </main>
  );
}
