import Link from "next/link";
import { ShieldCheck, Plane, FileText, Landmark, Sparkles, ArrowRight } from "lucide-react";

const services = [
  { icon: Plane, title: "Travel services", body: "Itineraries, reservations, visas, and full travel files managed end to end." },
  { icon: FileText, title: "Document services", body: "Contracts, attestations, and official paperwork drafted, tracked, and verifiable." },
  { icon: Landmark, title: "Business support", body: "Company formalities, payments, receipts, and structured client records." },
  { icon: Sparkles, title: "Creative projects", body: "Brand and creative work under the JUN Creatif division." },
];

const values = [
  { k: "Rigor", v: "Every file, payment, and document lives in one traceable record." },
  { k: "Verifiability", v: "Official documents carry registry IDs, integrity hashes, and QR verification." },
  { k: "Discretion", v: "Sensitive documents stay in a restricted vault with audited access." },
  { k: "Care", v: "One responsible person for each client, from first contact to closure." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero — the registry ribbon is the signature: a real-looking document ID
          that ties the public promise to the internal system. */}
      <section className="bg-night text-white">
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-24">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">JUN CREATIF AND TRAVEL LLC</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight sm:text-6xl">
            Travel and documents, run like an institution.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            We manage journeys, paperwork, and payments inside one accountable system — so every
            commitment we make to you is recorded, numbered, and verifiable.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-lg bg-electric px-6 py-3 font-medium text-white transition hover:brightness-110">
              Contact us <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/services" className="rounded-lg border border-white/25 px-6 py-3 text-white/85 transition hover:bg-white/5">
              Explore services
            </Link>
          </div>
          <div className="mt-14 inline-flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-3">
            <ShieldCheck className="h-5 w-5 text-gold" />
            <span className="text-sm text-white/70">Every official document is verifiable:</span>
            <span className="registry-id text-gold">JUN-CTR-2026-000148</span>
            <span className="text-sm text-white/40">→ juncreatif.org/verify</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="font-display text-3xl">What we do</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <div key={s.title} className="rounded-xl border border-line bg-white p-6 shadow-sm">
              <s.icon className="h-6 w-6 text-electric" />
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl">Why clients choose JUN</h2>
            <p className="mt-4 text-muted2">
              Because travel and legal paperwork are too important for loose ends. Our internal
              platform — JUN Business Hub — keeps every client file, contract, payment, and refund
              connected, dated, and auditable.
            </p>
          </div>
          <dl className="grid gap-6 sm:grid-cols-2">
            {values.map((v) => (
              <div key={v.k}>
                <dt className="font-semibold">{v.k}</dt>
                <dd className="mt-1 text-sm text-muted2">{v.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="rounded-2xl bg-night px-8 py-12 text-white sm:px-12">
          <h2 className="font-display text-3xl">Our divisions</h2>
          <p className="mt-3 max-w-2xl text-white/70">
            JUN operates focused divisions — Travel, Documents, and Creatif — sharing one standard of
            record-keeping and one point of accountability.
          </p>
          <Link href="/brands" className="mt-6 inline-flex items-center gap-2 text-gold hover:underline">
            Meet the divisions <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
