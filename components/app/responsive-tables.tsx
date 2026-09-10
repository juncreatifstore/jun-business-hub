"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Makes every data table in the hub readable on phones without touching the
 * pages: each <td> gets a `data-label` copied from its column header, and CSS
 * (globals.css, `.jun-stack`) turns rows into stacked cards under 768px.
 * Opt out per table with `data-no-stack`.
 */
function label(table: HTMLTableElement) {
  if (table.dataset.noStack !== undefined) return;
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th, thead td")).map((th) =>
    (th.textContent ?? "").trim(),
  );
  if (!headers.length) return;
  table.classList.add("jun-stack");
  for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
    let col = 0;
    for (const cell of Array.from(row.cells)) {
      if (cell.colSpan > 1) {
        cell.dataset.label = "";
      } else {
        cell.dataset.label = headers[col] ?? "";
      }
      col += cell.colSpan || 1;
    }
  }
}

export function ResponsiveTables() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.querySelector("main");
    if (!root) return;
    const run = () => root.querySelectorAll<HTMLTableElement>("table").forEach(label);
    run();
    const obs = new MutationObserver(run);
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [pathname]);
  return null;
}
