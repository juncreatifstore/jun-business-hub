import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-ink/[0.055]", className)} {...props} />
  );
}
