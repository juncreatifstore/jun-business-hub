"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  Gauge,
  Landmark,
  Lock,
  PiggyBank,
  RefreshCw,
  Search,
  SearchCheck,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WorkQueue = {
  total: number;
  authorizations: number;
  transfers: number;
  reconciliation: number;
  evidence: number;
  reserves: number;
};

const items = [
  {
    href: "/app/company-funds",
    label: "Vue générale",
    short: "Vue générale",
    icon: Landmark,
    group: "Pilotage",
  },
  {
    href: "/app/company-funds/executive",
    label: "Direction financière",
    short: "Direction",
    icon: Gauge,
    group: "Pilotage",
  },
  {
    href: "/app/company-funds/consolidation",
    label: "Consolidation",
    short: "Consolidation",
    icon: RefreshCw,
    group: "Contrôle",
  },
  {
    href: "/app/company-funds/reconciliation",
    label: "Réconciliation",
    short: "Réconciliation",
    icon: SearchCheck,
    group: "Contrôle",
  },
  {
    href: "/app/company-funds/monthly-close",
    label: "Clôture mensuelle",
    short: "Clôture",
    icon: CalendarCheck2,
    group: "Contrôle",
  },
  {
    href: "/app/company-funds/transfers",
    label: "Transferts internes",
    short: "Transferts",
    icon: ArrowRightLeft,
    group: "Opérations",
  },
  {
    href: "/app/company-funds/reserves",
    label: "Réserves financières",
    short: "Réserves",
    icon: PiggyBank,
    group: "Opérations",
  },
  {
    href: "/app/company-funds/authorizations",
    label: "Autorisations financières",
    short: "Autorisations",
    icon: Lock,
    group: "Sécurité",
  },
  {
    href: "/app/company-funds/execution-evidence",
    label: "Preuves d’exécution",
    short: "Preuves",
    icon: FileCheck2,
    group: "Sécurité",
  },
  {
    href: "/app/company-funds/timeline",
    label: "Timeline des opérations",
    short: "Timeline",
    icon: Activity,
    group: "Sécurité",
  },
] as const;

type ItemHref = (typeof items)[number]["href"];
const FAVORITES_KEY = "jun.companyFunds.favorites";
const RECENTS_KEY = "jun.companyFunds.recents";

function isActive(pathname: string, href: string) {
  if (href === "/app/company-funds") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemCount(href: string, queue: WorkQueue) {
  if (href.endsWith("/reconciliation")) return queue.reconciliation;
  if (href.endsWith("/transfers")) return queue.transfers;
  if (href.endsWith("/reserves")) return queue.reserves;
  if (href.endsWith("/authorizations")) return queue.authorizations;
  if (href.endsWith("/execution-evidence")) return queue.evidence;
  return 0;
}

function validHrefs(value: unknown): ItemHref[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(items.map((item) => item.href));
  return value.filter((href): href is ItemHref => typeof href === "string" && allowed.has(href as ItemHref));
}

export function CompanyFundsNav({ workQueue }: { workQueue: WorkQueue }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isQueueRefreshing, startQueueRefresh] = useTransition();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [favorites, setFavorites] = useState<ItemHref[]>([]);
  const [recents, setRecents] = useState<ItemHref[]>([]);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [lastQueueRefreshAt, setLastQueueRefreshAt] = useState<Date | null>(null);

  const currentIndex = Math.max(
    0,
    items.findIndex((item) => isActive(pathname, item.href)),
  );
  const current = items[currentIndex] || items[0];
  const previous = currentIndex > 0 ? items[currentIndex - 1] : null;
  const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : null;

  function go(href: string) {
    if (isActive(pathname, href)) return;
    setNavigatingTo(href);
    setPaletteOpen(false);
    startTransition(() => router.push(href));
  }

  function refreshQueue() {
    if (isQueueRefreshing) return;
    startQueueRefresh(() => router.refresh());
  }

  useEffect(() => {
    const candidates = [
      previous?.href,
      next?.href,
      ...favorites.slice(0, 2),
      ...recents.filter((href) => href !== current.href).slice(0, 2),
    ];
    const prefetched = new Set<string>();
    for (const href of candidates) {
      if (!href || href === current.href || prefetched.has(href)) continue;
      prefetched.add(href);
      router.prefetch(href);
    }
  }, [current.href, favorites, next?.href, previous?.href, recents, router]);

  useEffect(() => {
    setNavigatingTo(null);
    const active = document.querySelector<HTMLElement>("[data-company-funds-active='true']");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [pathname]);

  useEffect(() => {
    setLastQueueRefreshAt(new Date());
  }, [
    workQueue.total,
    workQueue.authorizations,
    workQueue.transfers,
    workQueue.reconciliation,
    workQueue.evidence,
    workQueue.reserves,
  ]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      startQueueRefresh(() => router.refresh());
    };
    const interval = window.setInterval(refreshWhenVisible, 30000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  useEffect(() => {
    try {
      setFavorites(validHrefs(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")));
      setRecents(validHrefs(JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]")));
    } catch {
      setFavorites([]);
      setRecents([]);
    }
  }, []);

  useEffect(() => {
    const href = current.href;
    setRecents((previousRecents) => {
      const nextRecents = [href, ...previousRecents.filter((item) => item !== href)].slice(0, 5);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(nextRecents));
      } catch {}
      return nextRecents;
    });
  }, [current.href]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (!typing && (event.metaKey || event.ctrlKey) && event.key === "ArrowLeft" && previous) {
        event.preventDefault();
        go(previous.href);
        return;
      }
      if (!typing && (event.metaKey || event.ctrlKey) && event.key === "ArrowRight" && next) {
        event.preventDefault();
        go(next.href);
        return;
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, previous, pathname]);

  useEffect(() => {
    setPaletteOpen(false);
    setQuery("");
    setPaletteIndex(0);
  }, [pathname]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.group} ${item.label} ${item.short}`.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    setPaletteIndex(0);
  }, [query]);

  const favoriteItems = items.filter((item) => favorites.includes(item.href));
  const recentItems = recents
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is (typeof items)[number] => Boolean(item));

  function toggleFavorite(href: ItemHref) {
    setFavorites((previousFavorites) => {
      const nextFavorites = previousFavorites.includes(href)
        ? previousFavorites.filter((item) => item !== href)
        : [...previousFavorites, href];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(nextFavorites));
      } catch {}
      return nextFavorites;
    });
  }

  const quickItems = [
    { href: "/app/company-funds/authorizations", label: "Autorisations", count: workQueue.authorizations },
    { href: "/app/company-funds/reconciliation", label: "À rapprocher", count: workQueue.reconciliation },
    { href: "/app/company-funds/transfers", label: "En transit", count: workQueue.transfers },
    { href: "/app/company-funds/execution-evidence", label: "Preuves manquantes", count: workQueue.evidence },
    { href: "/app/company-funds/reserves", label: "Alertes réserves", count: workQueue.reserves },
  ].filter((item) => item.count > 0);

  const busy = isPending || Boolean(navigatingTo);
  const queueRefreshLabel = lastQueueRefreshAt
    ? lastQueueRefreshAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      <div
        className="sticky top-16 z-30 -mx-4 border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur-md md:-mx-6 md:px-6"
        aria-live="polite"
      >
        {busy ? (
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-line">
            <div className="h-full w-1/3 animate-pulse bg-accent" />
          </div>
        ) : null}

        {/* Row 1: where am I + jump */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-ink-3">
            <button
              type="button"
              onClick={() => go("/app/company-funds")}
              className="shrink-0 hover:text-ink"
            >
              Fonds de l’entreprise
            </button>
            <span className="text-ink-3/60">/</span>
            <span className="shrink-0">{current.group}</span>
            <span className="text-ink-3/60">/</span>
            <span className="truncate font-medium text-ink">{current.label}</span>
            <button
              type="button"
              onClick={() => toggleFavorite(current.href)}
              className="ml-0.5 rounded-md p-1 text-ink-3 transition hover:bg-surface-2 hover:text-warning"
              aria-label={favorites.includes(current.href) ? "Retirer des favoris" : "Ajouter aux favoris"}
              title={favorites.includes(current.href) ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              <Star
                className={cn("h-3.5 w-3.5", favorites.includes(current.href) && "fill-warning text-warning")}
              />
            </button>
          </div>
          <div className="hidden items-center gap-2 text-xs text-ink-3 sm:flex">
            {workQueue.total > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full tint-warning px-2.5 py-1 font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                {workQueue.total} à traiter
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />À jour
              </span>
            )}
            <button
              type="button"
              onClick={refreshQueue}
              disabled={isQueueRefreshing}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              title={`Actualiser les compteurs${queueRefreshLabel ? ` · ${queueRefreshLabel}` : ""}`}
              aria-label="Actualiser les compteurs financiers"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isQueueRefreshing && "animate-spin")} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 text-xs text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            title="Aller à une section — Ctrl/⌘ K"
            aria-label="Rechercher une section Finance"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Aller à…</span>
            <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-3 md:inline">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Row 2: sections */}
        <div className="-mx-4 mt-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:-mx-6 md:px-6">
          <nav aria-label="Sections Fonds de l’entreprise" className="flex min-w-max items-center gap-1">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const count = itemCount(item.href, workQueue);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  data-company-funds-active={active ? "true" : undefined}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  onClick={(event) => {
                    if (
                      !active &&
                      event.button === 0 &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.shiftKey &&
                      !event.altKey
                    )
                      setNavigatingTo(item.href);
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                    active
                      ? "border-ink bg-ink text-canvas"
                      : "border-line bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.short}</span>
                  {count > 0 ? (
                    <span
                      className={cn(
                        "inline-flex min-w-4 items-center justify-center rounded-full px-1 text-2xs font-bold tabular-nums",
                        active ? "bg-canvas/20 text-canvas" : "bg-danger text-white",
                      )}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        {favoriteItems.length > 0 || quickItems.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {quickItems.map((item) => (
              <button
                type="button"
                key={item.href}
                onClick={() => go(item.href)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full tint-warning px-2.5 font-medium text-warning transition hover:opacity-80"
              >
                {item.label}
                <span className="tabular-nums">{item.count}</span>
              </button>
            ))}
            {favoriteItems
              .filter((item) => item.href !== current.href)
              .map((item) => (
                <button
                  type="button"
                  key={`fav-${item.href}`}
                  onClick={() => go(item.href)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface-1 px-2.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  <Star className="h-3 w-3 fill-warning text-warning" />
                  {item.short}
                </button>
              ))}
          </div>
        ) : null}
      </div>

      {paletteOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface-3 shadow-pop"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Search className="h-5 w-5 text-muted2" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setPaletteIndex((index) => Math.min(index + 1, Math.max(0, filteredItems.length - 1)));
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setPaletteIndex((index) => Math.max(0, index - 1));
                    return;
                  }
                  if (event.key === "Enter" && filteredItems[paletteIndex]) {
                    event.preventDefault();
                    go(filteredItems[paletteIndex].href);
                  }
                }}
                placeholder="Rechercher une option Finance…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted2"
              />
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className="rounded-lg p-1.5 text-muted2 hover:bg-surface hover:text-ink"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-2">
              {!query && favoriteItems.length > 0 ? (
                <div className="mb-2">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted2">
                    Favoris
                  </div>
                  {favoriteItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={`palette-fav-${item.href}`}
                        type="button"
                        onClick={() => go(item.href)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-surface-2"
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg tint-warning text-warning">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-ink">{item.label}</span>
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {!query && recentItems.length > 1 ? (
                <div className="mb-2">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted2">
                    Récents
                  </div>
                  {recentItems
                    .filter((item) => item.href !== current.href)
                    .slice(0, 3)
                    .map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={`palette-recent-${item.href}`}
                          type="button"
                          onClick={() => go(item.href)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-surface-2"
                        >
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="flex-1 text-sm font-semibold text-ink">{item.label}</span>
                          <Clock3 className="h-3.5 w-3.5 text-muted2" />
                        </button>
                      );
                    })}
                </div>
              ) : null}
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted2">
                Toutes les sections
              </div>
              {filteredItems.map((item, index) => {
                const Icon = item.icon;
                const count = itemCount(item.href, workQueue);
                const favorite = favorites.includes(item.href);
                const selected = index === paletteIndex;
                return (
                  <div
                    key={item.href}
                    onMouseEnter={() => setPaletteIndex(index)}
                    className={cn(
                      "group flex items-center gap-1 rounded-xl",
                      selected ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => go(item.href)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                    >
                      <span
                        className={cn(
                          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          selected ? "bg-white" : "bg-surface group-hover:bg-white",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted2">{item.group}</span>
                        <span className="block truncate text-sm font-semibold text-ink">{item.label}</span>
                      </span>
                      {count > 0 ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">
                          {count}
                        </span>
                      ) : null}
                      {selected ? (
                        <span className="text-[10px] font-medium text-muted2">Entrée ↵</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item.href)}
                      className="mr-2 rounded-lg p-2 text-muted2 hover:bg-white hover:text-warning"
                      aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                    >
                      <Star className={cn("h-4 w-4", favorite && "fill-amber-400 text-amber-500")} />
                    </button>
                  </div>
                );
              })}
              {!filteredItems.length ? (
                <div className="px-4 py-8 text-center text-sm text-muted2">Aucune option trouvée.</div>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t border-line bg-surface-2/60 px-4 py-2 text-[10px] text-muted2">
              <span>↑ ↓ naviguer · Entrée ouvrir</span>
              <span>Ctrl/⌘ K · Échap fermer</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
