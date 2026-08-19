import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const user = await requireUser();
  if (!can(user, "TEAM_MANAGE")) redirect("/app/forbidden");

  const departments = await prisma.department.findMany({
    orderBy: { label: "asc" },
    include: { users: { where: { role: { not: "CLIENT" } }, orderBy: { lastName: "asc" } } },
  });

  return (
    <div>
      <PageHeader title="Departments" subtitle="Organizational structure of JUN CREATIF AND TRAVEL LLC. Departments are seeded and assigned from the Team page." />
      {departments.length === 0 ? (
        <EmptyState icon={Building2} title="No departments" description="Run the database seed (npm run db:seed) to create the nine standard departments." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{d.label}</CardTitle>
                  <Badge className="bg-white/10 text-white/70">{d.users.length} member{d.users.length === 1 ? "" : "s"}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {d.users.length === 0 ? (
                  <p className="text-sm text-muted2">No members yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {d.users.map((u) => (
                      <li key={u.id} className="flex items-center justify-between text-sm">
                        <span>{u.firstName} {u.lastName}</span>
                        <span className="text-xs text-muted2">{u.role.replaceAll("_", " ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
