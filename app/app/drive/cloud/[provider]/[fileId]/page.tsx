import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, DownloadCloud, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  getCloudConnection,
  isCloudAdmin,
  refreshCloudConnection,
  type CloudProvider,
} from "@/lib/drive-cloud";
import { importCloudFile } from "@/services/drive-cloud";

export const dynamic = "force-dynamic";

function providerOf(value: string): CloudProvider | null {
  return value === "google" || value === "microsoft" ? value : null;
}

async function fileMeta(provider: CloudProvider, accessToken: string, fileId: string) {
  if (provider === "google") {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,modifiedTime&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const m = (await res.json()) as { name: string; mimeType: string; size?: string; webViewLink?: string };
    return { name: m.name, mimeType: m.mimeType, webUrl: m.webViewLink ?? null };
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const m = (await res.json()) as { name: string; file?: { mimeType?: string }; webUrl?: string };
  return { name: m.name, mimeType: m.file?.mimeType ?? "application/octet-stream", webUrl: m.webUrl ?? null };
}

/** Which viewer the browser can render inline for this MIME type. */
function viewerKind(mime: string): "pdf" | "image" | "video" | "audio" | "text" | "none" {
  if (mime === "application/pdf" || mime.startsWith("application/vnd.google-apps.")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  return "none";
}

export default async function CloudFilePage(props: {
  params: Promise<{ provider: string; fileId: string }>;
}) {
  const params = await props.params;
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const provider = providerOf(params.provider);
  if (!provider) redirect("/app/drive/cloud");
  const connection = await getCloudConnection(user.id, provider);
  if (!connection) redirect(`/app/drive/cloud?error=${provider}_not_connected`);

  const meta = await refreshCloudConnection(connection)
    .then((c) => fileMeta(provider, c.accessToken, params.fileId))
    .catch(() => null);
  const label = provider === "google" ? "Google Drive" : "OneDrive";
  const src = `/api/drive/cloud/${provider}/file/${encodeURIComponent(params.fileId)}`;
  const kind = meta ? viewerKind(meta.mimeType) : "none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            prefetch={false}
            href="/app/drive/cloud"
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Connected Cloud
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{meta?.name ?? "File"}</h1>
            <p className="text-xs text-muted2">
              {label}
              {meta ? ` · ${meta.mimeType}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={importCloudFile}>
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="fileId" value={params.fileId} />
            <button className="inline-flex items-center gap-1 rounded-lg bg-electric px-3 py-2 text-xs font-medium text-white">
              <DownloadCloud className="h-3.5 w-3.5" /> Import into JUN Drive
            </button>
          </form>
          <a
            href={`${src}?download=1`}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          {meta?.webUrl ? (
            <a
              href={meta.webUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs text-muted2 hover:bg-surface hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in {label}
            </a>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        {!meta ? (
          <p className="p-6 text-sm text-red-700">This file could not be read from {label}.</p>
        ) : kind === "pdf" || kind === "text" ? (
          <iframe src={src} title={meta.name} className="h-[78vh] w-full bg-white" />
        ) : kind === "image" ? (
          <div className="flex max-h-[78vh] items-center justify-center bg-surface p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={meta.name} className="max-h-[74vh] max-w-full object-contain" />
          </div>
        ) : kind === "video" ? (
          <video src={src} controls className="max-h-[78vh] w-full bg-black" />
        ) : kind === "audio" ? (
          <div className="p-6">
            <audio src={src} controls className="w-full" />
          </div>
        ) : (
          <div className="p-6 text-sm text-muted2">
            No in-app preview for this type. Use <strong className="text-ink">Download</strong> or import it
            into JUN Drive.
          </div>
        )}
      </div>
    </div>
  );
}
