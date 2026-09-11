import Link from "next/link";
import { Clock3, Cloud, HardDrive, Star, Trash2, Users, Link2 } from "lucide-react";
import { getCloudConnection, isCloudAdmin, type CloudProvider } from "@/lib/drive-cloud";

export type DriveSidebarActive =
  "my" | "recent" | "starred" | "shared" | "trash" | `cloud:${CloudProvider}` | "cloud";

const NAV = [
  { key: "my", label: "My Drive", icon: HardDrive, href: "/app/drive" },
  { key: "recent", label: "Recent", icon: Clock3, href: "/app/drive?view=recent" },
  { key: "starred", label: "Starred", icon: Star, href: "/app/drive?view=starred" },
  { key: "shared", label: "Shared with me", icon: Users, href: "/app/drive?view=shared" },
  { key: "trash", label: "Trash", icon: Trash2, href: "/app/drive?view=trash" },
] as const;

const CLOUD_LABEL: Record<CloudProvider, string> = { google: "Google Drive", microsoft: "OneDrive" };

/**
 * Left navigation shared by the Drive browser and the cloud views: JUN views
 * first, then every connected cloud drive as a peer entry.
 */
export async function DriveSidebar({
  active,
  userId,
  role,
}: {
  active: DriveSidebarActive;
  userId: string;
  role: string;
}) {
  const admin = isCloudAdmin(role);
  const connected = admin
    ? (
        await Promise.all(
          (["google", "microsoft"] as const).map(async (p) =>
            (await getCloudConnection(userId, p)) ? p : null,
          ),
        )
      ).filter((p): p is CloudProvider => p !== null)
    : [];
  const item = (key: string, href: string, label: string, Icon: typeof HardDrive) => {
    const isActive = active === key;
    return (
      <Link
        key={key}
        prefetch={false}
        href={href}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? "bg-blue-50 text-electric" : "text-muted2 hover:bg-surface hover:text-ink"}`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };
  return (
    <aside>
      <nav className="sticky top-5 space-y-1 rounded-xl border border-line bg-white p-2 shadow-sm">
        {NAV.map((n) => item(n.key, n.href, n.label, n.icon))}
        {admin ? (
          <>
            <div className="mt-2 border-t border-line pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted2 px-3">
              Cloud
            </div>
            {connected.map((p) =>
              item(`cloud:${p}`, `/app/drive/cloud?provider=${p}`, CLOUD_LABEL[p], Cloud),
            )}
            {item(
              "cloud",
              "/app/drive/cloud",
              connected.length ? "Manage connections" : "Connect a cloud",
              Link2,
            )}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
