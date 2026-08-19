import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
      <p className="registry-id text-muted2">404</p>
      <h1 className="text-xl font-semibold">This page doesn&apos;t exist</h1>
      <Link href="/" className="text-electric hover:underline">Back to juncreatif.org</Link>
    </div>
  );
}
