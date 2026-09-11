import "server-only";
import { listEmailAliases, EMAIL_ALIAS_DOMAIN } from "@/lib/email-aliases";

export type MailService = { email: string; label: string; color: string };

/** Display metadata per alias local part; unknown aliases get a neutral badge. */
const KNOWN: Record<string, { label: string; color: string }> = {
  contact: { label: "Contact", color: "bg-accent/15 text-accent" },
  support: { label: "Support client", color: "bg-success/15 text-success" },
  finance: { label: "Finance", color: "bg-warning/15 text-warning" },
  travel: { label: "Voyages", color: "bg-cyan-500/15 text-cyan-400" },
  documents: { label: "Documents", color: "bg-violet-500/15 text-violet-400" },
  legal: { label: "Juridique", color: "bg-rose-500/15 text-rose-400" },
  info: { label: "Informations", color: "bg-indigo-500/15 text-indigo-400" },
  noreply: { label: "Automatique", color: "bg-neutral/15 text-ink-3" },
};
const ORDER = Object.keys(KNOWN);

/** Confirmed aliases from the database, in a stable display order. */
export async function listMailServices(): Promise<MailService[]> {
  const aliases = (await listEmailAliases()).filter((a) => a.confirmed);
  return aliases
    .map((a) => {
      const local = a.address.toLowerCase().replace(`@${EMAIL_ALIAS_DOMAIN}`, "");
      const meta = KNOWN[local] ?? {
        label: local.charAt(0).toUpperCase() + local.slice(1),
        color: "bg-neutral/15 text-ink-3",
      };
      return { email: a.address.toLowerCase(), ...meta };
    })
    .sort((x, y) => {
      const ix = ORDER.indexOf(x.email.split("@")[0]),
        iy = ORDER.indexOf(y.email.split("@")[0]);
      return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy) || x.label.localeCompare(y.label);
    });
}
