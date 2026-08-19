import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-night text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-2xl">JUN</p>
          <p className="mt-2 text-sm text-white/60">
            JUN CREATIF AND TRAVEL LLC. Travel, documentation, and business services — handled with rigor.
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Company</p>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li><Link href="/about" className="hover:text-white">About</Link></li>
            <li><Link href="/services" className="hover:text-white">Services</Link></li>
            <li><Link href="/brands" className="hover:text-white">Divisions</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Support</p>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
            <li><Link href="/login" className="hover:text-white">Client access</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Verification</p>
          <p className="mt-3 text-sm text-white/70">
            Every official JUN document carries a registry ID and a QR code. Scan it to verify authenticity.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/40">
        © {new Date().getFullYear()} JUN CREATIF AND TRAVEL LLC · www.juncreatif.org
      </div>
    </footer>
  );
}
