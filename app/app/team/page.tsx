import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { TeamForm } from "@/components/app/team-form";
import { createTeamMember, setUserStatus, resetUserPassword } from "@/services/team";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireUser();
  if (!can(user, "TEAM_MANAGE")) redirect("/app/forbidden");

  const [members, departments] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "CLIENT" } },
      orderBy: [{ role: "asc" }, { lastName: "asc" }],
      include: { department: true },
    }),
    prisma.department.findMany({ orderBy: { label: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Team" subtitle="Staff accounts, roles and access. Client-portal accounts are managed from each client page." />

      <Card className="mb-8">
        <CardHeader><CardTitle>Add a team member</CardTitle></CardHeader>
        <CardContent>
          <TeamForm action={createTeamMember} departments={departments.map((d) => ({ id: d.id, label: d.label }))} allowSuperAdmin={user.role === "SUPER_ADMIN"} />
        </CardContent>
      </Card>

      <Table>
        <THead><tr><TH>Name</TH><TH>Role</TH><TH>Department</TH><TH>Status</TH><TH>Last login</TH><TH>Actions</TH></tr></THead>
        <tbody>
          {members.map((m) => {
            const isSelf = m.id === user.id;
            const protectedTarget = m.role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN";
            return (
              <TR key={m.id}>
                <TD>
                  <p className="font-medium">{m.firstName} {m.lastName}{isSelf ? <span className="ml-2 text-xs text-muted2">(you)</span> : null}</p>
                  <p className="text-xs text-muted2">{m.email}</p>
                </TD>
                <TD><Badge className="bg-white/10 text-white/80">{m.role.replaceAll("_", " ")}</Badge></TD>
                <TD className="text-muted2">{m.department?.label ?? "—"}</TD>
                <TD><StatusBadge status={m.status} /></TD>
                <TD className="text-muted2">{m.lastLoginAt ? formatDate(m.lastLoginAt) : "Never"}</TD>
                <TD>
                  {isSelf || protectedTarget ? (
                    <span className="text-xs text-muted2">—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {m.status === "ACTIVE" ? (
                        <form action={setUserStatus.bind(null, m.id, "SUSPENDED")}>
                          <button className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted2 hover:border-amber-400 hover:text-amber-400">Suspend</button>
                        </form>
                      ) : (
                        <form action={setUserStatus.bind(null, m.id, "ACTIVE")}>
                          <button className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted2 hover:border-emerald-400 hover:text-emerald-400">Activate</button>
                        </form>
                      )}
                      <form action={resetUserPassword.bind(null, m.id)} className="flex items-center gap-1">
                        <input name="password" type="password" minLength={10} required placeholder="New password" className="h-7 w-32 rounded-md border border-white/10 bg-white/5 px-2 text-xs outline-none focus:border-electric" />
                        <button className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted2 hover:border-electric hover:text-electric">Reset</button>
                      </form>
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
