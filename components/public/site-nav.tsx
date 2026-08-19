"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/brands", label: "Divisions" },
  { href: "/contact", label: "Contact" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-night/95 text-white backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl tracking-tight">JUN</span>
          <span className="hidden text-[11px] uppercase tracking-[0.2em] text-white/60 sm:block">
            Creatif and Travel LLC
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-white/75 transition hover:text-white">
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-lg border border-gold/50 px-4 py-1.5 text-gold transition hover:bg-gold/10"
          >
            Sign in
          </Link>
        </nav>
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open ? (
        <nav className="border-t border-white/10 px-5 py-4 md:hidden">
          {[...links, { href: "/login", label: "Sign in" }].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 text-white/80">
              {l.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
