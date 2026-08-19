import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <p className="registry-id text-muted2">403</p>
      <h1 className="text-lg font-semibold">You don&apos;t have access to this area</h1>
      <p className="max-w-md text-sm text-muted2">
        Your role doesn&apos;t include the required permission. Ask an administrator if you believe this is a mistake.
      </p>
      <Link href="/app"><Button>Back to dashboard</Button></Link>
    </div>
  );
}
