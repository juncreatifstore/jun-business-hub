import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate, cn } from "@/lib/utils";
import { setTaskStatus } from "@/services/tasks";
import { CheckSquare } from "lucide-react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { view?: string; status?: string; assignee?: string; focus?: string };
}) {
  await requirePermission("TASK_READ");
  const status = searchParams.status;
  const assignee = searchParams.assignee;
  const now = new Date();

  const where: Prisma.TaskWhereInput = {
    ...(status === "OVERDUE"
      ? { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, dueDate: { lt: now } }
      : status && status !== "ALL"
        ? { status: status as never }
        : {}),
    ...(assignee && assignee !== "ALL" ? { assigneeId: assignee } : {}),
  };

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where, orderBy: [{ status: "asc" }, { dueDate: "asc" }], take: 200,
      include: { assignee: true, client: true, case: true },
    }),
    prisma.user.findMany({ where: { status: "ACTIVE", role: { not: "CLIENT" } }, orderBy: { firstName: "asc" } }),
  ]);

  const byAssignee = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const key = t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Unassigned";
    byAssignee.set(key, [...(byAssignee.get(key) ?? []), t]);
  }
  const grouped = searchParams.view === "assignee";

  return (
    <div>
      <PageHeader title="Tasks" subtitle="What must happen, by whom, by when." actionHref="/app/tasks/new" actionLabel="New task">
        <Link href={`/app/tasks?view=${grouped ? "list" : "assignee"}`}>
          <Button variant="outline">{grouped ? "List view" : "By assignee"}</Button>
        </Link>
      </PageHeader>

      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value={searchParams.view ?? "list"} />
        <Select name="status" defaultValue={status ?? "ALL"} className="w-44">
          <option value="ALL">All statuses</option>
          <option value="OVERDUE">Overdue</option>
          {["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"].map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
          ))}
        </Select>
        <Select name="assignee" defaultValue={assignee ?? "ALL"} className="w-52">
          <option value="ALL">All assignees</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </Select>
        <Button variant="outline">Filter</Button>
      </form>

      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks here" description="Create a task to make the next step explicit." actionHref="/app/tasks/new" actionLabel="Create task" />
      ) : grouped ? (
        <div className="space-y-6">
          {[...byAssignee.entries()].map(([name, list]) => (
            <div key={name}>
              <h2 className="mb-2 text-sm font-semibold">{name} <span className="text-muted2">({list.length})</span></h2>
              <TaskList tasks={list} focus={searchParams.focus} />
            </div>
          ))}
        </div>
      ) : (
        <TaskList tasks={tasks} focus={searchParams.focus} />
      )}
    </div>
  );
}

function TaskList({ tasks, focus }: { tasks: any[]; focus?: string }) {
  const now = new Date();
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      {tasks.map((t) => {
        const overdue = t.dueDate && new Date(t.dueDate) < now && !["DONE", "CANCELLED"].includes(t.status);
        return (
          <li key={t.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", focus === t.id && "bg-electric/5")}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-xs text-muted2">
                {t.case ? <Link className="registry-id hover:text-electric" href={`/app/cases/${t.case.id}`}>{t.case.caseNumber}</Link> : null}
                {t.client ? <> · <Link className="hover:text-electric" href={`/app/clients/${t.client.id}`}>{t.client.firstName} {t.client.lastName}</Link></> : null}
                {t.dueDate ? <span className={overdue ? " font-medium text-red-600" : ""}> · due {formatDate(t.dueDate)}{overdue ? " (overdue)" : ""}</span> : null}
              </p>
            </div>
            <StatusBadge status={t.priority} />
            <form action={setTaskStatus.bind(null, t.id)} className="flex items-center gap-1.5">
              <Select name="status" defaultValue={t.status} className="h-8 w-36 text-xs">
                {["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"].map((s) => (
                  <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                ))}
              </Select>
              <Button size="sm" variant="ghost">Set</Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
