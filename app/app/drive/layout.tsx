import Link from "next/link";
import { BrainCircuit } from "lucide-react";

export default function DriveLayout({ children }: { children: React.ReactNode }) {
  return <div className="text-ink" data-drive-release="phase6-2026-08-20"><div className="mb-4 flex justify-end"><Link href="/app/drive/search" className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100"><BrainCircuit className="h-4 w-4" /> Smart Search</Link></div>{children}</div>;
}
