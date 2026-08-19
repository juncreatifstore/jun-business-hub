import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <p className="registry-id text-muted2">401</p>
      <h1 className="text-lg font-semibold">Sign in required</h1>
      <Link href="/login"><Button>Go to sign in</Button></Link>
    </div>
  );
}
