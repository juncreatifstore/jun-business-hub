"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, RotateCcw } from "lucide-react";

const STORAGE_KEY = "jun.companyFunds.filters";
type Props = { countries: string[]; currencies: string[] };
type Saved = { country?: string; currency?: string; period?: string };

const periods = [
  { value: "", label: "Toutes périodes" },
  { value: "30", label: "30 derniers jours" },
  { value: "90", label: "90 derniers jours" },
  { value: "365", label: "12 derniers mois" },
] as const;

export function CompanyFundsFilters({ countries, currencies }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hydrated, setHydrated] = useState(false);

  const country = searchParams.get("country") || "";
  const currency = searchParams.get("currency") || "";
  const period = searchParams.get("period") || "";
  const activeCount = [country, currency, period].filter(Boolean).length;

  const allowedCountries = useMemo(() => new Set(countries), [countries]);
  const allowedCurrencies = useMemo(() => new Set(currencies), [currencies]);

  function replaceFilters(next: Saved) {
    const params = new URLSearchParams(searchParams.toString());
    const values = {
      country: next.country ?? country,
      currency: next.currency ?? currency,
      period: next.period ?? period,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {}
  }

  useEffect(() => {
    if (hydrated) return;
    setHydrated(true);
    if (country || currency || period) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Saved;
      const validCountry = saved.country && allowedCountries.has(saved.country) ? saved.country : "";
      const validCurrency = saved.currency && allowedCurrencies.has(saved.currency) ? saved.currency : "";
      const validPeriod = periods.some((item) => item.value === saved.period) ? saved.period || "" : "";
      if (validCountry || validCurrency || validPeriod)
        replaceFilters({ country: validCountry, currency: validCurrency, period: validPeriod });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedCountries, allowedCurrencies, hydrated]);

  function reset() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("country");
    params.delete("currency");
    params.delete("period");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2 shadow-card"
      aria-label="Filtres globaux Fonds de l’entreprise"
      title="Ces filtres restent mémorisés pendant la navigation Finance et s’appliquent aux écrans compatibles."
    >
      <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
        <Filter className="h-4 w-4 text-ink-3" />
        Filtres
        {activeCount > 0 ? (
          <span className="rounded-full bg-ink px-1.5 py-0.5 text-2xs font-semibold text-canvas">
            {activeCount}
          </span>
        ) : null}
      </span>
      <select
        aria-label="Pays"
        value={country}
        onChange={(event) => replaceFilters({ country: event.target.value })}
        className="h-9 w-full rounded-lg border border-line-strong bg-surface-1 px-2.5 text-sm text-ink outline-none transition focus:border-accent md:w-auto md:min-w-[160px]"
      >
        <option value="">Tous les pays</option>
        {countries.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <select
        aria-label="Devise"
        value={currency}
        onChange={(event) => replaceFilters({ currency: event.target.value })}
        className="h-9 w-full rounded-lg border border-line-strong bg-surface-1 px-2.5 text-sm text-ink outline-none transition focus:border-accent md:w-auto md:min-w-[160px]"
      >
        <option value="">Toutes les devises</option>
        {currencies.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <select
        aria-label="Période"
        value={period}
        onChange={(event) => replaceFilters({ period: event.target.value })}
        className="h-9 w-full rounded-lg border border-line-strong bg-surface-1 px-2.5 text-sm text-ink outline-none transition focus:border-accent md:w-auto md:min-w-[160px]"
      >
        {periods.map((item) => (
          <option key={item.value || "all"} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {activeCount > 0 ? (
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Réinitialiser
        </button>
      ) : null}
    </div>
  );
}
