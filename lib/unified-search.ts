import "server-only";
import { prisma } from "@/lib/prisma";
import { DRIVE_INTEL_PREFIX, DRIVE_TAGS_PREFIX } from "@/lib/drive-intelligence";
import { DOC_TYPE_LABELS, docTypeOf, expiryStatus, type DocType } from "@/lib/file-extraction";
import { getCloudConnection, isCloudAdmin, listCloudFiles } from "@/lib/drive-cloud";
import { decodeWhatsAppInboxPayload } from "@/lib/whatsapp-inbox";
import { getAccessibleMailboxIds } from "@/lib/mail-security";
import type { CurrentUser } from "@/lib/auth";

export type SearchSource = "JUN" | "GOOGLE" | "MAIL" | "WHATSAPP" | "SIGNED";
export type SearchHit = {
  source: SearchSource;
  id: string;
  title: string;
  subtitle: string;
  excerpt?: string;
  href: string;
  date: Date | null;
  docType?: DocType | null;
  expiresAt?: Date | null;
  expiry?: ReturnType<typeof expiryStatus>;
  clientLabel?: string | null;
  score: number;
};
export type SearchFilters = {
  q: string;
  sources: SearchSource[];
  clientId?: string | null;
  docType?: DocType | null;
  expiresBefore?: Date | null;
};

const STOP = new Set([
  "the",
  "a",
  "an",
  "de",
  "des",
  "du",
  "la",
  "le",
  "les",
  "un",
  "une",
  "et",
  "pour",
  "dans",
  "of",
  "for",
  "with",
  "avec",
  "find",
  "trouve",
  "chercher",
  "recherche",
]);
export function tokens(q: string) {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((v) => v.trim())
    .filter((v) => v.length >= 2 && !STOP.has(v))
    .slice(0, 8);
}
const ci = (v: string) => ({ contains: v, mode: "insensitive" as const });

async function searchJun(f: SearchFilters, user: CurrentUser): Promise<SearchHit[]> {
  const toks = tokens(f.q);
  const hasQuery = Boolean(f.q);
  // 1. AI index / tags (content) — only when there is a query
  const scoreMap = new Map<string, { score: number; excerpt: string }>();
  if (hasQuery) {
    const settingMatches = await prisma.appSetting.findMany({
      where: {
        OR: [
          { key: { startsWith: DRIVE_INTEL_PREFIX }, value: ci(f.q) },
          { key: { startsWith: DRIVE_TAGS_PREFIX }, value: ci(f.q) },
          ...toks.flatMap((t) => [
            { key: { startsWith: DRIVE_INTEL_PREFIX }, value: ci(t) },
            { key: { startsWith: DRIVE_TAGS_PREFIX }, value: ci(t) },
          ]),
        ],
      },
      take: 800,
      select: { key: true, value: true },
    });
    for (const s of settingMatches) {
      const prefix = s.key.startsWith(DRIVE_INTEL_PREFIX) ? DRIVE_INTEL_PREFIX : DRIVE_TAGS_PREFIX;
      const id = s.key.slice(prefix.length);
      const hay = s.value.toLowerCase();
      let score = hay.includes(f.q.toLowerCase()) ? 8 : 0;
      for (const t of toks) if (hay.includes(t)) score += 2;
      let excerpt = "";
      if (prefix === DRIVE_INTEL_PREFIX) {
        try {
          const parsed = JSON.parse(s.value) as { summary?: string; contentExcerpt?: string };
          excerpt = parsed.summary || parsed.contentExcerpt?.slice(0, 220) || "";
        } catch {}
      }
      const old = scoreMap.get(id);
      if (!old || score > old.score) scoreMap.set(id, { score, excerpt });
    }
  }
  // 2. Metadata + extraction fields
  const textOr = hasQuery
    ? [
        { name: ci(f.q) },
        ...toks.map((t) => ({ name: ci(t) })),
        { extraction: { holderName: ci(f.q) } },
        { extraction: { documentNumber: ci(f.q) } },
        { extraction: { reference: ci(f.q) } },
        { extraction: { issuer: ci(f.q) } },
        { client: { OR: [{ firstName: ci(f.q) }, { lastName: ci(f.q) }, { internalId: ci(f.q) }] } },
        ...(scoreMap.size ? [{ id: { in: Array.from(scoreMap.keys()) } }] : []),
      ]
    : undefined;
  const files = await prisma.file.findMany({
    where: {
      isVault: false,
      archivedAt: null,
      ...(f.clientId ? { clientId: f.clientId } : {}),
      ...(f.docType ? { extraction: { docType: f.docType } } : {}),
      ...(f.expiresBefore
        ? {
            extraction: {
              is: { expiresAt: { lte: f.expiresBefore }, ...(f.docType ? { docType: f.docType } : {}) },
            },
          }
        : {}),
      ...(textOr ? { OR: textOr } : {}),
    },
    take: 120,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { firstName: true, lastName: true } },
      case: { select: { caseNumber: true } },
      extraction: true,
    },
  });
  void user;
  return files.map((x) => {
    const s = scoreMap.get(x.id);
    const nameHit = hasQuery && x.name.toLowerCase().includes(f.q.toLowerCase()) ? 6 : 0;
    const fieldHit =
      hasQuery &&
      [x.extraction?.holderName, x.extraction?.documentNumber, x.extraction?.reference].some((v) =>
        v?.toLowerCase().includes(f.q.toLowerCase()),
      )
        ? 7
        : 0;
    const docType = (x.extraction?.docType ?? null) as DocType | null;
    return {
      source: "JUN" as const,
      id: x.id,
      title: x.name,
      subtitle: [
        docType && docType !== "OTHER" ? DOC_TYPE_LABELS[docType] : x.category.replace(/_/g, " "),
        x.extraction?.holderName,
        x.case?.caseNumber,
      ]
        .filter(Boolean)
        .join(" · "),
      excerpt: s?.excerpt,
      href: `/app/drive?q=${encodeURIComponent(x.name)}`,
      date: x.createdAt,
      docType,
      expiresAt: x.extraction?.expiresAt ?? null,
      expiry: expiryStatus(x.extraction?.expiresAt ?? null),
      clientLabel: x.client ? `${x.client.firstName} ${x.client.lastName}` : null,
      score: (s?.score ?? 0) + nameHit + fieldHit + 1,
    };
  });
}

async function searchGoogle(f: SearchFilters, user: CurrentUser): Promise<SearchHit[]> {
  if (!f.q || !isCloudAdmin(user.role) || f.clientId || f.docType || f.expiresBefore) return [];
  const connection = await getCloudConnection(user.id, "google");
  if (!connection) return [];
  try {
    const files = await listCloudFiles(connection, undefined, { mode: "search", query: f.q });
    return files.slice(0, 25).map((x) => ({
      source: "GOOGLE" as const,
      id: x.id,
      title: x.name,
      subtitle: x.isFolder
        ? "Folder"
        : x.mimeType.startsWith("application/vnd.google-apps.")
          ? `Google ${x.mimeType.split(".").pop()}`
          : x.mimeType,
      href: x.isFolder
        ? `/app/drive/cloud?provider=google&googleFolder=${encodeURIComponent(x.id)}`
        : `/app/drive/cloud/google/${encodeURIComponent(x.id)}`,
      date: x.modifiedAt ? new Date(x.modifiedAt) : null,
      score: x.name.toLowerCase().includes(f.q.toLowerCase()) ? 5 : 2,
    }));
  } catch {
    return [];
  }
}

async function searchMail(f: SearchFilters, user: CurrentUser): Promise<SearchHit[]> {
  if (!f.q || f.docType || f.expiresBefore) return [];
  const mailboxIds = await getAccessibleMailboxIds(user);
  if (!mailboxIds.length) return [];
  const rows = await prisma.appSetting.findMany({
    where: {
      key: { startsWith: "mail.conversation." },
      value: { contains: `"filename":"` },
      AND: [{ value: ci(f.q) }],
    },
    take: 300,
    select: { key: true, value: true },
  });
  const threadIds = rows.map((r) => r.key.slice("mail.conversation.".length));
  const threads = await prisma.mailThread.findMany({
    where: {
      id: { in: threadIds },
      mailAccountId: { in: mailboxIds },
      ...(f.clientId ? { clientId: f.clientId } : {}),
    },
    select: {
      id: true,
      subject: true,
      fromEmail: true,
      lastMessageAt: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  const byId = new Map(threads.map((t) => [t.id, t]));
  const hits: SearchHit[] = [];
  for (const r of rows) {
    const t = byId.get(r.key.slice("mail.conversation.".length));
    if (!t) continue;
    try {
      const parsed = JSON.parse(r.value) as {
        messages?: Array<{
          id: string;
          from: string;
          date: string;
          attachments?: Array<{ filename: string; mimeType: string; attachmentId?: string | null }>;
        }>;
      };
      for (const m of parsed.messages ?? [])
        for (const a of m.attachments ?? []) {
          if (!a.attachmentId) continue;
          const match =
            a.filename.toLowerCase().includes(f.q.toLowerCase()) ||
            tokens(f.q).some((k) => a.filename.toLowerCase().includes(k));
          if (!match && !(t.subject ?? "").toLowerCase().includes(f.q.toLowerCase())) continue;
          hits.push({
            source: "MAIL",
            id: `${t.id}:${m.id}:${a.attachmentId}`,
            title: a.filename,
            subtitle: `${t.subject || "(sans objet)"} · ${m.from}`,
            href: `/app/mail?thread=${t.id}`,
            date: m.date ? new Date(m.date) : t.lastMessageAt,
            clientLabel: t.client ? `${t.client.firstName} ${t.client.lastName}` : null,
            score: match ? 5 : 2,
          });
        }
    } catch {}
  }
  return hits.slice(0, 40);
}

async function searchWhatsApp(f: SearchFilters): Promise<SearchHit[]> {
  if (!f.q || f.docType || f.expiresBefore) return [];
  const rows = await prisma.activity.findMany({
    where: {
      resourceType: "WhatsAppConversation",
      message: { contains: `"mediaId":"` },
      AND: [{ message: ci(f.q) }],
      ...(f.clientId ? { clientId: f.clientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      message: true,
      createdAt: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  const hits: SearchHit[] = [];
  for (const r of rows) {
    const p = decodeWhatsAppInboxPayload(r.message);
    if (!p || !p.mediaId) continue;
    const label =
      p.filename || p.caption || (p.type === "image" ? "Photo" : p.type === "video" ? "Vidéo" : "Document");
    hits.push({
      source: "WHATSAPP",
      id: p.mediaId,
      title: label,
      subtitle: `WhatsApp · ${p.contactName || p.phone}`,
      href: `/app/whatsapp/inbox?phone=${encodeURIComponent(p.phone)}`,
      date: r.createdAt,
      clientLabel: r.client ? `${r.client.firstName} ${r.client.lastName}` : null,
      score: 3,
    });
  }
  return hits;
}

async function searchSigned(f: SearchFilters): Promise<SearchHit[]> {
  if (f.docType || f.expiresBefore) return [];
  const docs = await prisma.document.findMany({
    where: {
      ...(f.clientId ? { clientId: f.clientId } : {}),
      ...(f.q
        ? { OR: [{ title: ci(f.q) }, { documentId: ci(f.q) }, ...tokens(f.q).map((t) => ({ title: ci(t) }))] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      documentId: true,
      title: true,
      type: true,
      status: true,
      updatedAt: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  return docs.map((d) => ({
    source: "SIGNED" as const,
    id: d.id,
    title: d.title,
    subtitle: `${d.documentId} · ${d.type} · ${d.status}`,
    href: `/app/documents/${d.id}`,
    date: d.updatedAt,
    clientLabel: d.client ? `${d.client.firstName} ${d.client.lastName}` : null,
    score: d.title.toLowerCase().includes(f.q.toLowerCase()) ? 5 : 2,
  }));
}

export async function unifiedSearch(f: SearchFilters, user: CurrentUser): Promise<SearchHit[]> {
  const want = new Set(
    f.sources.length ? f.sources : (["JUN", "GOOGLE", "MAIL", "WHATSAPP", "SIGNED"] as SearchSource[]),
  );
  const [jun, google, mail, wa, signed] = await Promise.all([
    want.has("JUN") ? searchJun(f, user) : [],
    want.has("GOOGLE") ? searchGoogle(f, user) : [],
    want.has("MAIL") ? searchMail(f, user) : [],
    want.has("WHATSAPP") ? searchWhatsApp(f) : [],
    want.has("SIGNED") ? searchSigned(f) : [],
  ]);
  return [...jun, ...google, ...mail, ...wa, ...signed].sort(
    (a, b) => b.score - a.score || (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
  );
}

export function parseDocTypeFilter(v: unknown): DocType | null {
  if (!v) return null;
  const t = docTypeOf(v);
  return t === "OTHER" && String(v).toUpperCase() !== "OTHER" ? null : t;
}
