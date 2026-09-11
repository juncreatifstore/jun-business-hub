import { Skeleton } from "@/components/ui/skeleton";

/** Mail-shaped skeleton: shown instantly while the server renders the list or a thread. */
export default function Loading() {
  return (
    <div className="space-y-3" aria-label="Chargement du courrier">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-1 px-3 py-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden space-y-2 rounded-2xl border border-line bg-surface-1 p-3 lg:block">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
