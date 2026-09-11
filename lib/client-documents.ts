import "server-only";
import { prisma } from "@/lib/prisma";
import { DOC_TYPE_LABELS, EXPIRING_DOC_TYPES, expiryStatus, type DocType } from "@/lib/file-extraction";
import {
  clientRequiredDocTypes,
  loadRequirementProfiles,
  profileForCaseType,
} from "@/lib/document-requirements";

export type ClientDocGroup = {
  docType: DocType;
  label: string;
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
    holderName: string | null;
    documentNumber: string | null;
    expiresAt: Date | null;
    expiry: ReturnType<typeof expiryStatus>;
    confidence: number;
  }>;
};

export async function clientDocumentGroups(clientId: string) {
  const [files, required] = await Promise.all([
    prisma.file.findMany({
      where: { clientId, archivedAt: null, isVault: false },
      orderBy: { createdAt: "desc" },
      include: { extraction: true },
    }),
    clientRequiredDocTypes(clientId),
  ]);
  const groups = new Map<DocType, ClientDocGroup>();
  for (const f of files) {
    const t = (f.extraction?.docType ?? "OTHER") as DocType;
    const g = groups.get(t) ?? { docType: t, label: DOC_TYPE_LABELS[t] ?? t, files: [] };
    g.files.push({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt,
      holderName: f.extraction?.holderName ?? null,
      documentNumber: f.extraction?.documentNumber ?? null,
      expiresAt: f.extraction?.expiresAt ?? null,
      expiry: expiryStatus(f.extraction?.expiresAt ?? null),
      confidence: f.extraction?.confidence ?? 0,
    });
    groups.set(t, g);
  }
  const present = new Set(groups.keys());
  const missing = required.filter((t) => !present.has(t));
  const alerts = files
    .filter(
      (f) =>
        f.extraction?.expiresAt &&
        EXPIRING_DOC_TYPES.has(f.extraction.docType as DocType) &&
        expiryStatus(f.extraction.expiresAt) !== "ok",
    )
    .map((f) => ({
      fileId: f.id,
      name: f.name,
      docType: f.extraction!.docType as DocType,
      expiresAt: f.extraction!.expiresAt!,
      status: expiryStatus(f.extraction!.expiresAt),
    }));
  const pending = files.filter((f) => !f.extraction).length;
  // Identity groups first, then the rest alphabetically.
  const order = (t: DocType) => (required.includes(t) ? required.indexOf(t) : 100);
  const sorted = Array.from(groups.values()).sort(
    (a, b) => order(a.docType) - order(b.docType) || a.label.localeCompare(b.label),
  );
  return { groups: sorted, missing, required, alerts, total: files.length, pending };
}

/** One row per client with coverage figures, for the clients index. */
export async function clientDocumentOverview() {
  const profiles = await loadRequirementProfiles();
  const clients = await prisma.client.findMany({
    where: { archivedAt: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      internalId: true,
      firstName: true,
      lastName: true,
      status: true,
      nationality: true,
      cases: {
        where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"] } },
        select: { type: true },
      },
      files: {
        where: { archivedAt: null, isVault: false },
        select: { id: true, extraction: { select: { docType: true, expiresAt: true } } },
      },
    },
  });
  return clients.map((c) => {
    const types = new Set(c.files.map((f) => f.extraction?.docType ?? "OTHER"));
    const req = new Set<DocType>();
    const list = c.cases.length
      ? c.cases.map((k) => profileForCaseType(profiles, k.type))
      : [profileForCaseType(profiles, "")];
    for (const p of list) for (const t of p.required) req.add(t);
    const missing = Array.from(req).filter((t) => !types.has(t));
    let worst: ReturnType<typeof expiryStatus> = null;
    for (const f of c.files) {
      if (!f.extraction?.expiresAt || !EXPIRING_DOC_TYPES.has(f.extraction.docType as DocType)) continue;
      const s = expiryStatus(f.extraction.expiresAt);
      const rank = { expired: 3, critical: 2, soon: 1, ok: 0 } as const;
      if (s && (!worst || rank[s] > rank[worst])) worst = s;
    }
    return {
      id: c.id,
      internalId: c.internalId,
      name: `${c.firstName} ${c.lastName}`,
      status: c.status,
      nationality: c.nationality,
      total: c.files.length,
      typed: c.files.filter((f) => f.extraction && f.extraction.docType !== "OTHER").length,
      missing,
      worstExpiry: worst,
    };
  });
}
