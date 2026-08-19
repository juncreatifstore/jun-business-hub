export const metadata = { title: "Divisions" };

const divisions = [
  { name: "JUN Travel", role: "Journeys & visas", body: "The travel division: itineraries, reservations, visa files, and traveler support." },
  { name: "JUN Documents", role: "Official paperwork", body: "Contracts, attestations, and verifiable documents managed under the JUN registry." },
  { name: "JUN Creatif", role: "Creative studio", body: "Brand, design, and creative projects for clients and partner ventures." },
];

export default function BrandsPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <p className="text-[11px] uppercase tracking-[0.3em] text-electric">Divisions</p>
      <h1 className="mt-3 font-display text-4xl">One company, focused divisions</h1>
      <p className="mt-4 max-w-2xl text-muted2">
        Brands and projects operated by — or connected to — JUN CREATIF AND TRAVEL LLC share the same
        operating standard: numbered records, verifiable documents, and one accountable owner per file.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {divisions.map((d) => (
          <div key={d.name} className="rounded-xl border border-line bg-white p-6 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold">{d.role}</p>
            <h2 className="mt-2 font-display text-2xl">{d.name}</h2>
            <p className="mt-3 text-sm text-muted2">{d.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
