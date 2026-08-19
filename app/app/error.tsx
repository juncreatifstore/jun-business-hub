"use client";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted2">{error.message || "An unexpected error occurred. The details were logged."}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
