import { cn } from "@/lib/utils";

/**
 * Status vocabulary → five tones. Adding a status means picking a tone here,
 * not inventing colours at the call site.
 */
export type Tone = "info" | "warning" | "success" | "danger" | "neutral" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  info: "tint-info text-info border-info/25",
  accent: "tint-accent text-accent border-accent/25",
  warning: "tint-warning text-warning border-warning/25",
  success: "tint-success text-success border-success/25",
  danger: "tint-danger text-danger border-danger/25",
  neutral: "tint-neutral text-neutral border-neutral/25",
};

const STATUS_TONE: Record<string, Tone> = {
  // Cases / tasks
  OPEN: "info",
  TODO: "info",
  IN_PROGRESS: "warning",
  WAITING: "accent",
  WAITING_CLIENT: "accent",
  WAITING_INTERNAL: "accent",
  COMPLETED: "success",
  DONE: "success",
  CANCELLED: "neutral",
  ARCHIVED: "neutral",
  // Money
  PENDING: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "warning",
  REQUESTED: "info",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  // Documents / signatures
  DRAFT: "neutral",
  FINAL: "info",
  SIGNED: "success",
  VOIDED: "danger",
  READY_FOR_SIGNATURE: "info",
  SENT: "info",
  VIEWED: "accent",
  PARTIALLY_SIGNED: "warning",
  // Clients / priority / AI
  ACTIVE: "success",
  LEAD: "info",
  INACTIVE: "neutral",
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
  PROPOSED: "info",
  EXECUTED: "success",
  FAILED: "danger",
};

export function toneFor(status: string): Tone {
  return STATUS_TONE[status] ?? "neutral";
}

export function Badge({
  className,
  tone,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-semibold leading-4 tracking-wide",
        tone ? TONE_CLASS[tone] : "border-line bg-surface-2 text-ink-2",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={toneFor(status)} className={className}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
