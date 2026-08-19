import Link from "next/link";
import { Button } from "./button";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-electric/10">
        <Icon className="h-6 w-6 text-electric" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted2">{description}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="mt-5">
          <Button variant="primary">{actionLabel}</Button>
        </Link>
      ) : null}
    </div>
  );
}
