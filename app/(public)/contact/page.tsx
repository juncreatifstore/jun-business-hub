import { ContactForm } from "./contact-form";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="text-[11px] uppercase tracking-[0.3em] text-electric">Contact</p>
      <h1 className="mt-3 font-display text-4xl">Tell us what you need</h1>
      <p className="mt-4 text-muted2">
        Your message opens a tracked request routed to the right department. We reply from a named
        team member, not a no-reply address.
      </p>
      <div className="mt-10">
        <ContactForm />
      </div>
    </div>
  );
}
