import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { TaskForm } from "@/components/app/task-form";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: { caseId?: string; clientId?: string };
}) {
  await requirePermission("TASK_CREATE");
  const [clients, cases, users] = await Promise.all([
    prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    prisma.case.findMany({ where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, caseNumber: true, title: true } }),
    prisma.user.findMany({ where: { status: "ACTIVE", role: { not: "CLIENT" } }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  return (
    <div>
      <PageHeader title="New task" />
      <TaskForm clients={clients} cases={cases} users={users} defaultCaseId={searchParams.caseId} defaultClientId={searchParams.clientId} />
    </div>
  );
}
