export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <p className="text-[11px] uppercase tracking-[0.3em] text-electric">About</p>
      <h1 className="mt-3 font-display text-4xl">JUN CREATIF AND TRAVEL LLC</h1>
      <div className="mt-8 space-y-10">
        <section>
          <h2 className="text-xl font-semibold">The company</h2>
          <p className="mt-2 text-muted2">
            JUN CREATIF AND TRAVEL LLC is a service company built around a simple conviction: the
            people we serve deserve institutional-grade handling of their travel, documents, and
            payments — not improvisation. We combine human responsibility with a purpose-built
            operations platform, JUN Business Hub.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Mission</h2>
          <p className="mt-2 text-muted2">
            To carry each client&apos;s file from first contact to completion with full traceability:
            every document numbered, every payment receipted, every commitment recorded.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Vision</h2>
          <p className="mt-2 text-muted2">
            To be the reference for trustworthy travel and documentation services in our communities,
            where a JUN registry ID on a document means it can be verified by anyone, anywhere.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">How we work</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted2">
            <li>Each client has one responsible agent and one consolidated 360° file.</li>
            <li>Every case follows explicit statuses — nothing waits in an inbox.</li>
            <li>Official documents receive a unique ID, an integrity hash, and a QR verification link.</li>
            <li>Payments and refunds are approved, receipted, and auditable.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
