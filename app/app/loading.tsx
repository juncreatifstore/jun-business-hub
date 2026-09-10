import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5" aria-label="Chargement">
      <div className="rounded-2xl border border-line bg-ink/[0.018] p-5 sm:p-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-8 w-64 max-w-[70%]" />
        <Skeleton className="mt-3 h-4 w-[420px] max-w-[90%]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-line bg-ink/[0.018] p-4">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="mt-4 h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-28" />
            <Skeleton className="mt-3 h-3 w-36" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,.7fr)]">
        <div className="rounded-2xl border border-line bg-ink/[0.018] p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-8" />
          </div>
          <Skeleton className="mt-5 h-64 w-full" />
        </div>
        <div className="rounded-2xl border border-line bg-ink/[0.018] p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-5 h-8 w-40" />
          <div className="mt-6 space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
