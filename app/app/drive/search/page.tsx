import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { reindexDriveLibrary } from "@/services/drive-search";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { unifiedSearch, parseDocTypeFilter, type SearchSource, type SearchHit } from "@/lib/unified-search";
import { DOC_TYPES, DOC_TYPE_LABELS } from "@/lib/file-extraction";
import { isCloudAdmin } from "@/lib/drive-cloud";
import {
  ArrowLeft,
  BrainCircuit,
  Cloud,
  FileSignature,
  FileText,
  HardDrive,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
} from "lucide-react";

export const dynamic = "force-dynamic";

const SOURCES: Array<{ key: SearchSource; label: string; icon: typeof HardDrive }> = [
  { key: "JUN", label: "JUN Drive", icon: HardDrive },
  { key: "GOOGLE", label: "Google Drive", icon: Cloud },
  { key: "MAIL", label: "Mail attachments", icon: Mail },
  { key: "WHATSAPP", label: "WhatsApp media", icon: MessageCircle },
  { key: "SIGNED", label: "Documents & signatures", icon: FileSignature },
];

function SourceIcon({ source }: { source: SearchSource }) {
  const Icon = SOURCES.find((s) => s.key === source)?.icon ?? FileText;
  return <Icon className="h-4 w-4 shrink-0 text-muted2" />;
}

export default async function DriveSmartSearchPage(props: {
  searchParams: Promise<{
    q?: string;
    src?: string | string[];
    client?: string;
    type?: string;
    expires?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  if (!can(user, "FILE_READ")) redirect("/app/forbidden");
  const q = String(searchParams.q ?? "")
    .trim()
    .slice(0, 200);
  const srcRaw = Array.isArray(searchParams.src)
    ? searchParams.src
    : searchParams.src
      ? [searchParams.src]
      : [];
  const sources = srcRaw.filter((s): s is SearchSource => SOURCES.some((x) => x.key === s));
  const clientId = (searchParams.client ?? "").trim() || null;
  const docType = parseDocTypeFilter(searchParams.type);
  const expiresBefore =
    searchParams.expires === "30" || searchParams.expires === "90" || searchParams.expires === "expired"
      ? new Date(
          Date.now() + (searchParams.expires === "expired" ? 0 : Number(searchParams.expires)) * 86_400_000,
        )
      : null;
  const active = Boolean(q || clientId || docType || expiresBefore);

  const [clients, results] = await Promise.all([
    prisma.client.findMany({
      where: { archivedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, internalId: true },
      take: 500,
    }),
    active
      ? unifiedSearch({ q, sources, clientId, docType, expiresBefore }, user)
      : Promise.resolve([] as SearchHit[]),
  ]);
  const counts = results.reduce<Record<string, number>>(
    (acc, r) => ((acc[r.source] = (acc[r.source] ?? 0) + 1), acc),
    {},
  );
  const cloudAdmin = isCloudAdmin(user.role);

  return (
    <div>
      <div className="mb-5">
        <Link
          prefetch={false}
          href="/app/drive"
          className="inline-flex items-center gap-2 text-sm text-muted2 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Drive
        </Link>
      </div>
      <PageHeader
        title="Search everything"
        subtitle="One search across JUN Drive, Google Drive, e-mail attachments, WhatsApp media and signed documents. Filter by client, document type or expiry. Vault content is never included."
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form method="get" className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative min-w-[280px] flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted2" />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Passport Marie, invoice 2024-118, visa Colombie, relevé bancaire…"
                  className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-electric"
                />
              </div>
              <select
                name="client"
                defaultValue={clientId ?? ""}
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric"
              >
                <option value="">Any client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} · {c.internalId}
                  </option>
                ))}
              </select>
              <select
                name="type"
                defaultValue={docType ?? ""}
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric"
              >
                <option value="">Any document type</option>
                {DOC_TYPES.filter((t) => t !== "OTHER").map((t) => (
                  <option key={t} value={t}>
                    {DOC_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <select
                name="expires"
                defaultValue={searchParams.expires ?? ""}
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric"
              >
                <option value="">Any expiry</option>
                <option value="expired">Already expired</option>
                <option value="30">Expires within 30 days</option>
                <option value="90">Expires within 90 days</option>
              </select>
              <Button type="submit">Search</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted2">Sources:</span>
              {SOURCES.filter((s) => s.key !== "GOOGLE" || cloudAdmin).map((s) => (
                <label key={s.key} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="src"
                    value={s.key}
                    defaultChecked={!sources.length || sources.includes(s.key)}
                  />
                  <s.icon className="h-3.5 w-3.5 text-muted2" /> {s.label}
                  {active && counts[s.key] ? (
                    <span className="rounded bg-surface px-1 text-[10px] text-muted2">{counts[s.key]}</span>
                  ) : null}
                </label>
              ))}
              {can(user, "AI_USE") ? (
                <span className="ml-auto">
                  <Button type="submit" formAction={reindexDriveLibrary} variant="secondary" size="sm">
                    <RefreshCw className="h-3.5 w-3.5" /> Reindex JUN Drive
                  </Button>
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {!active ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted2">
          <BrainCircuit className="mx-auto mb-3 h-6 w-6" />
          Type a name, a document number, a holder, a subject — or just pick a client, a type or an expiry
          window.
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted2">
          No result.
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {results.slice(0, 150).map((r) => (
            <li
              key={`${r.source}:${r.id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-surface/60"
            >
              <SourceIcon source={r.source} />
              <div className="min-w-0 flex-1">
                <Link
                  prefetch={false}
                  href={r.href}
                  className="block truncate font-medium hover:text-electric"
                >
                  {r.title}
                </Link>
                <div className="truncate text-xs text-muted2">
                  {[SOURCES.find((s) => s.key === r.source)?.label, r.subtitle, r.clientLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {r.excerpt ? <div className="mt-1 line-clamp-2 text-xs text-muted2">{r.excerpt}</div> : null}
              </div>
              {r.expiresAt ? (
                <span
                  className={`text-xs ${r.expiry === "expired" ? "font-medium text-red-700" : r.expiry === "critical" || r.expiry === "soon" ? "text-amber-700" : "text-muted2"}`}
                >
                  {r.expiry === "expired" ? "expired " : "exp. "}
                  {r.expiresAt.toLocaleDateString("fr-FR")}
                </span>
              ) : null}
              <span className="text-xs text-muted2">{r.date ? r.date.toLocaleDateString("fr-FR") : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
