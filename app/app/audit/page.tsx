import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: { q?: string; type?: string } }) {
  const user = await requireUser();
  if (!can(user, "AUDIT_READ")) redirect("/app/forbidden");

  const q = (searchParams.q ?? "").trim();
  const type = (searchParams.type ?? "").trim();

  const [logs, types] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(type ? { resourceType: type } : {}),
        ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { resourceId: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: true },
    }),
    prisma.auditLog.groupBy({ by: ["resourceType"], _count: { _all: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Append-only record of every sensitive action. Entries are never edited or deleted." />

      <form method="get" className="mb-4 flex flex-wrap gap-3">
        <input name="q" defaultValue={q} placeholder="Search action or resource id…" className="h-10 w-64 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-electric" />
        <select name="type" defaultValue={type} className="h-10 rounded-lg border border-white/10 bg-night px-3 text-sm outline-none focus:border-electric">
          <option value="">All resources</option>
          {types.map((t) => <option key={t.resourceType} value={t.resourceType}>{t.resourceType} ({t._count._all})</option>)}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries" description={q || type ? "Nothing matches these filters." : "Sensitive actions will be recorded here automatically."} />
      ) : (
        <Table>
          <THead><tr><TH>When</TH><TH>Actor</TH><TH>Action</TH><TH>Resource</TH><TH>IP</TH></tr></THead>
          <tbody>
            {logs.map((l) => (
              <TR key={l.id}>
                <TD className="whitespace-nowrap text-muted2">{formatDateTime(l.createdAt)}</TD>
                <TD>{l.user ? `${l.user.firstName} ${l.user.lastName}` : <span className="text-muted2">System</span>}</TD>
                <TD><span className="registry-id text-electric">{l.action}</span></TD>
                <TD className="text-muted2">{l.resourceType}{l.resourceId ? <span className="registry-id block text-xs">{l.resourceId}</span> : null}</TD>
                <TD className="text-muted2">{l.ip ?? "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
