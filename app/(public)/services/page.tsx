export const metadata = { title: "Services" };

// Service catalog — structured so an admin-managed table can replace this
// constant later (Settings/Admin can seed a Service model without UI changes).
const catalog = [
  {
    category: "Travel",
    items: [
      { name: "Trip planning & reservations", body: "Flights, lodging, and itineraries prepared and tracked as one travel file." },
      { name: "Visa assistance", body: "Requirements review, document checklists, and application follow-up." },
      { name: "Group & family travel", body: "Coordinated files for multiple travelers with a single point of contact." },
    ],
  },
  {
    category: "Documents",
    items: [
      { name: "Contracts & agreements", body: "Drafted, versioned, and finalized with registry IDs and verification QR codes." },
      { name: "Attestations & authorizations", body: "Official letters prepared to your case's exact requirements." },
      { name: "Receipts & payment records", body: "Every confirmed payment produces a numbered, verifiable receipt." },
    ],
  },
  {
    category: "Business support",
    items: [
      { name: "Refund management", body: "Structured refund agreements, installment schedules, and status tracking." },
      { name: "Client file administration", body: "One consolidated, confidential record for all your documents and history." },
    ],
  },
  {
    category: "Creatif",
    items: [
      { name: "Creative projects", body: "Brand and design work under the JUN Creatif division." },
    ],
  },
];

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <p className="text-[11px] uppercase tracking-[0.3em] text-electric">Services</p>
      <h1 className="mt-3 font-display text-4xl">What we take responsibility for</h1>
      <div className="mt-10 space-y-12">
        {catalog.map((c) => (
          <section key={c.category}>
            <h2 className="border-b border-line pb-2 text-sm font-semibold uppercase tracking-widest text-muted2">
              {c.category}
            </h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {c.items.map((i) => (
                <div key={i.name} className="rounded-xl border border-line bg-white p-5 shadow-sm">
                  <h3 className="font-semibold">{i.name}</h3>
                  <p className="mt-2 text-sm text-muted2">{i.body}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
