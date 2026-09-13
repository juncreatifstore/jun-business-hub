import Link from "next/link";
import {
  ChevronDown,
  Cloud,
  FileLock2,
  GitBranch,
  ListChecks,
  MessageSquare,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  HardDrive,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isCloudAdmin } from "@/lib/drive-cloud";

/**
 * Drive header: three zones. Files (browser, by client, collaboration),
 * Search, and an Administration menu holding the configuration modules.
 */
export default async function DriveLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const admin = user ? isCloudAdmin(user.role) : false;
  const tab =
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted2 hover:bg-surface hover:text-ink";
  const item = "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-surface";
  return (
    <div className="text-ink" data-drive-release="phase12-drive-workflows-2026-09-12">
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-line pb-3">
        <Link prefetch={false} href="/app/drive" className={tab}>
          <HardDrive className="h-4 w-4" /> Fichiers
        </Link>
        <Link prefetch={false} href="/app/drive/clients" className={tab}>
          <Users className="h-4 w-4" /> Par client
        </Link>
        <Link prefetch={false} href="/app/drive/collaboration" className={tab}>
          <MessageSquare className="h-4 w-4" /> Collaboration
        </Link>
        <Link prefetch={false} href="/app/drive/search" className={`${tab} ml-auto`}>
          <Search className="h-4 w-4" /> Rechercher partout
        </Link>
        {admin ? (
          <details className="group relative">
            <summary className={`${tab} cursor-pointer list-none select-none`}>
              <Settings2 className="h-4 w-4" /> Administration
              <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-line bg-white p-1.5 shadow-lg">
              <Link prefetch={false} href="/app/drive/automation" className={item}>
                <GitBranch className="h-4 w-4 text-emerald-700" /> Automatisation et règles d’expiration
              </Link>
              <Link prefetch={false} href="/app/drive/clients/requirements" className={item}>
                <ListChecks className="h-4 w-4 text-electric" /> Checklists par type de dossier
              </Link>
              <Link prefetch={false} href="/app/drive/enterprise" className={item}>
                <ShieldCheck className="h-4 w-4 text-amber-700" /> Enterprise: quota, retention, sharing,
                watermark
              </Link>
              <Link prefetch={false} href="/app/drive/privacy" className={item}>
                <FileLock2 className="h-4 w-4 text-rose-700" /> Politiques de confidentialité
              </Link>
              <Link prefetch={false} href="/app/drive/cloud" className={item}>
                <Cloud className="h-4 w-4 text-sky-700" /> Connexions cloud
              </Link>
            </div>
          </details>
        ) : null}
      </div>
      {children}
    </div>
  );
}
