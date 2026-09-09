import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "border border-blue-500/20 bg-blue-500/10 text-blue-400",
  IN_PROGRESS: "border border-amber-500/20 bg-amber-500/10 text-amber-600",
  WAITING_CLIENT: "border border-violet-500/20 bg-violet-500/10 text-violet-700",
  WAITING_INTERNAL: "border border-violet-500/20 bg-violet-500/10 text-violet-700",
  WAITING: "border border-violet-500/20 bg-violet-500/10 text-violet-700",
  COMPLETED: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  DONE: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  CANCELLED: "border border-slate-500/15 bg-slate-500/10 text-slate-500",
  ARCHIVED: "border border-slate-500/15 bg-slate-500/10 text-slate-500",
  TODO: "border border-blue-500/20 bg-blue-500/10 text-blue-400",
  PENDING: "border border-amber-500/20 bg-amber-500/10 text-amber-600",
  CONFIRMED: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  REJECTED: "border border-red-500/20 bg-red-500/10 text-red-600",
  REFUNDED: "border border-slate-500/15 bg-slate-500/10 text-slate-500",
  PARTIALLY_REFUNDED: "border border-amber-500/20 bg-amber-500/10 text-amber-600",
  REQUESTED: "border border-blue-500/20 bg-blue-500/10 text-blue-400",
  UNDER_REVIEW: "border border-amber-500/20 bg-amber-500/10 text-amber-600",
  APPROVED: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  PARTIALLY_PAID: "border border-amber-500/20 bg-amber-500/10 text-amber-600",
  PAID: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  DRAFT: "border border-slate-500/15 bg-slate-500/10 text-slate-500",
  FINAL: "border border-blue-400/20 bg-blue-500/15 text-blue-300",
  SIGNED: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  VOIDED: "border border-red-500/20 bg-red-500/10 text-red-600",
  ACTIVE: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  LEAD: "border border-blue-500/20 bg-blue-500/10 text-blue-400",
  INACTIVE: "border border-slate-500/15 bg-slate-500/10 text-slate-500",
  LOW: "border border-slate-500/15 bg-slate-500/10 text-slate-500",
  MEDIUM: "border border-blue-500/20 bg-blue-500/10 text-blue-400",
  HIGH: "border border-amber-500/20 bg-amber-500/10 text-amber-600",
  URGENT: "border border-red-500/20 bg-red-500/10 text-red-600",
  PROPOSED: "border border-blue-500/20 bg-blue-500/10 text-blue-400",
  EXECUTED: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  FAILED: "border border-red-500/20 bg-red-500/10 text-red-600",
  READY_FOR_SIGNATURE: "border border-blue-500/20 bg-blue-500/10 text-blue-400",
  SENT: "border border-blue-500/20 bg-blue-500/10 text-blue-400",
  VIEWED: "border border-violet-500/20 bg-violet-500/10 text-violet-700",
  PARTIALLY_SIGNED: "border border-amber-500/20 bg-amber-500/10 text-amber-600",
};

export function Badge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]", className)} {...props}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_STYLES[status] ?? "border border-slate-500/15 bg-slate-500/10 text-slate-500"}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
