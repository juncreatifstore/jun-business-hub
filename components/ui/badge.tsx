import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // shared status vocabulary across modules
  OPEN: "bg-electric/10 text-electric",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  WAITING_CLIENT: "bg-purple-100 text-purple-800",
  WAITING_INTERNAL: "bg-purple-100 text-purple-800",
  WAITING: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  DONE: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-gray-100 text-gray-600",
  ARCHIVED: "bg-gray-100 text-gray-600",
  TODO: "bg-electric/10 text-electric",
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  REFUNDED: "bg-gray-100 text-gray-600",
  PARTIALLY_REFUNDED: "bg-amber-100 text-amber-800",
  REQUESTED: "bg-electric/10 text-electric",
  UNDER_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  DRAFT: "bg-gray-100 text-gray-700",
  FINAL: "bg-night text-white",
  SIGNED: "bg-emerald-100 text-emerald-800",
  VOIDED: "bg-red-100 text-red-700",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  LEAD: "bg-electric/10 text-electric",
  INACTIVE: "bg-gray-100 text-gray-600",
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-electric/10 text-electric",
  HIGH: "bg-amber-100 text-amber-800",
  URGENT: "bg-red-100 text-red-700",
  PROPOSED: "bg-electric/10 text-electric",
  EXECUTED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-700",
};

export function Badge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", className)} {...props}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
