import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, DownloadCloud, ExternalLink, FolderOpen } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import {
  cloudFolderPath,
  getCloudConnection,
  getCloudFileDetails,
  isCloudAdmin,
  type CloudProvider,
} from "@/lib/drive-cloud";
import { importCloudFile } from "@/services/drive-cloud";
import { CloudFileAsk } from "@/components/app/cloud-file-ask";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { CloudTrashButton } from "@/components/app/cloud-trash-button";

export const dynamic = "force-dynamic";

function providerOf(value: string): CloudProvider | null {
  return value === "google" || value === "microsoft" ? value : null;
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

function size(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}
const OFFICE_PREVIEWABLE = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

export default async function CloudFilePage(props: {
  params: Promise<{ provider: string; fileId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const provider = providerOf(params.provider);
  if (!provider) redirect("/app/drive/cloud");
  const connection = await getCloudConnection(user.id, provider);
  if (!connection) redirect(`/app/drive/cloud?error=${provider}_not_connected`);

  const meta = await getCloudFileDetails(connection, params.fileId).catch(() => null);
  const crumbs = meta?.parentId ? await cloudFolderPath(connection, meta.parentId).catch(() => []) : [];
  const label = provider === "google" ? "Google Drive" : "OneDrive";
  const src = `/api/drive/cloud/${provider}/file/${encodeURIComponent(params.fileId)}`;
  const kind = meta ? viewerKind(meta.mimeType) : "none";
  const tab = searchParams.tab === "details" || searchParams.tab === "ai" ? searchParams.tab : "preview";
  const here = `/app/drive/cloud/${provider}/${encodeURIComponent(params.fileId)}`;
  const aiAllowed = can(user, "AI_USE");
  const folderHref = meta?.parentId
    ? `/app/drive/cloud?provider=${provider}&${provider}Folder=${encodeURIComponent(meta.parentId)}`
    : `/app/drive/cloud?provider=${provider}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            prefetch={false}
            href={folderHref}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface"
          >
            <ArrowLeft className="h-3.5 w-3.5" />{" "}
            {crumbs.length ? crumbs[crumbs.length - 1].name : "Connected Cloud"}
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{meta?.name ?? "File"}</h1>
            <p className="truncate text-xs text-muted2">
              {label}
              {crumbs.length ? ` · ${crumbs.map((c) => c.name).join(" / ")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyLinkButton url={here} />
          <a
            href={`${src}?download=1`}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <form action={importCloudFile}>
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="fileId" value={params.fileId} />
            <button className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface">
              <DownloadCloud className="h-3.5 w-3.5" /> Copy into JUN Drive
            </button>
          </form>
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
          {meta ? (
            <CloudTrashButton
              provider={provider}
              fileId={params.fileId}
              name={meta.name}
              returnTo={folderHref}
              providerLabel={label}
              variant="button"
            />
          ) : null}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-line text-sm" aria-label="File views">
        {(
          [
            ["preview", "Preview"],
            ["details", "Details"],
            ...(aiAllowed ? ([["ai", "JUN AI"]] as const) : []),
          ] as const
        ).map(([key, name]) => (
          <Link
            key={key}
            prefetch={false}
            href={key === "preview" ? here : `${here}?tab=${key}`}
            className={`-mb-px border-b-2 px-3 py-2 ${tab === key ? "border-electric font-medium text-ink" : "border-transparent text-muted2 hover:text-ink"}`}
          >
            {name}
          </Link>
        ))}
      </nav>

      {!meta ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-sm text-red-700">
          This file could not be read from {label}.
        </p>
      ) : tab === "details" ? (
        <dl className="grid gap-x-6 gap-y-3 rounded-2xl border border-line bg-white p-5 text-sm sm:grid-cols-2">
          {(
            [
              ["Name", meta.name],
              ["Type", meta.mimeType],
              ["Size", size(meta.sizeBytes)],
              ["Location", crumbs.length ? crumbs.map((c) => c.name).join(" / ") : "Root"],
              ["Owner", meta.owner ?? "—"],
              ["Last modified by", meta.lastModifiedBy ?? "—"],
              ["Created", when(meta.createdAt)],
              ["Modified", when(meta.modifiedAt)],
              ["Shared in " + label, meta.shared === null ? "—" : meta.shared ? "Yes" : "No"],
              ["Cloud file ID", meta.id],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-muted2">{k}</dt>
              <dd className="mt-0.5 break-words">{v}</dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <Link
              prefetch={false}
              href={folderHref}
              className="inline-flex items-center gap-1 text-xs text-electric hover:underline"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Open containing folder
            </Link>
          </div>
        </dl>
      ) : tab === "ai" ? (
        <div className="rounded-2xl border border-line bg-white p-5">
          <CloudFileAsk provider={provider} fileId={params.fileId} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          {kind === "pdf" || kind === "text" ? (
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
          ) : OFFICE_PREVIEWABLE.has(meta.mimeType) && meta.webUrl && provider === "google" ? (
            <div className="p-6 text-sm text-muted2">
              Office files are previewed by Google. Use{" "}
              <strong className="text-ink">Open in Google Drive</strong>, or ask{" "}
              <strong className="text-ink">JUN AI</strong> for a summary of the content.
            </div>
          ) : (
            <div className="p-6 text-sm text-muted2">
              No in-app preview for this type. Use <strong className="text-ink">Download</strong>, or ask{" "}
              <strong className="text-ink">JUN AI</strong> about its content.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
